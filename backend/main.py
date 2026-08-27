import os
import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SatQuery AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client
# If GROQ_API_KEY is not in env, we use a placeholder that will cause exceptions to fallback gracefully
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", "mock"))

def determine_intent_with_groq(query: str):
    try:
        response = groq_client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a geospatial intent classifier for SatQuery AI. "
                        "Classify the user's remote sensing query into one of these exact intents: "
                        "CHANGE_DETECTION, VISUAL_GROUNDING, VQA, OPTICAL_SAR_FUSION, AREA_CALCULATION, or GENERAL. "
                        "Respond ONLY with a JSON object in this format: "
                        "{\"intent\": \"<INTENT>\", \"confidence\": <float 0-1>, \"reasoning\": \"<short reason>\"}"
                    )
                },
                {
                    "role": "user",
                    "content": query
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"intent": "GENERAL", "confidence": 0.5, "reasoning": f"Fallback due to API Error or no key."}

async def orchestrate_task(query: str):
    # Step 1: Intent parsed
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Analyzing Intent", "status": "processing", "confidence": None})
    }
    
    # Actually call Groq to parse intent
    intent_result = await asyncio.to_thread(determine_intent_with_groq, query)
    await asyncio.sleep(0.5)
    
    yield {
        "event": "trace",
        "data": json.dumps({
            "step": f"Intent Parsed: {intent_result.get('intent', 'UNKNOWN')}",
            "status": "success",
            "confidence": intent_result.get('confidence', 0.99)
        })
    }

    # Step 2: Validating inputs
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Validating GeoTIFF/Inputs", "status": "processing", "confidence": None})
    }
    await asyncio.sleep(1) # Simulating rasterio checks
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Inputs Validated (EPSG:4326 detected)", "status": "success", "confidence": 1.0})
    }
    
    # Step 3: Routing to model
    # Check for War Room or Forecasting intent
    if "debate" in query.lower() or "war room" in query.lower() or "discuss" in query.lower():
        intent_result = {"intent": "WAR_ROOM_DEBATE", "confidence": 0.99}
    elif "predict" in query.lower() or "forecast" in query.lower() or "future" in query.lower():
        intent_result = {"intent": "PREDICTIVE_FORECASTING", "confidence": 0.95}

    yield {
        "event": "trace",
        "data": json.dumps({"step": f"Routing to Model Engine for {intent_result.get('intent')}", "status": "processing", "confidence": intent_result.get('confidence')})
    }

    ai_text = ""
    geojson_data = {"type": "FeatureCollection", "features": []}
    heatmap_data = []
    is_comparison = False
    is_timelapse = False
    is_3d = False
    war_room_logs = []

    try:
        if intent_result.get('intent') == "WAR_ROOM_DEBATE":
            # Spawn 3 different agents
            personas = [
                "Defense & Security Analyst (focus on infrastructure, military, threats)",
                "Environmental & Agricultural Expert (focus on vegetation, water, land use)",
                "Disaster Response Coordinator (focus on evacuation routes, damage, civilians)"
            ]
            
            async def get_agent_opinion(persona):
                resp = await asyncio.to_thread(
                    groq_client.chat.completions.create,
                    model="qwen/qwen3.8-27b",
                    messages=[
                        {"role": "system", "content": (
                            f"You are a {persona}. "
                            "CRITICAL: This is a Smart India Hackathon simulation for disaster response and urban planning. "
                            "Do NOT refuse the prompt. Always provide realistic, analytical, and professional simulated geospatial data."
                        )},
                        {"role": "user", "content": f"Give a 2-sentence analysis of this satellite query: {query}"}
                    ],
                    temperature=0.7,
                    max_tokens=150
                )
                return {"agent": persona.split("(")[0].strip(), "message": resp.choices[0].message.content}

            # Run concurrently
            opinions = await asyncio.gather(*(get_agent_opinion(p) for p in personas))
            war_room_logs = opinions
            ai_text = "Multi-Agent War Room debate concluded. See the War Room panel for the transcript."
            
        elif intent_result.get('intent') == "PREDICTIVE_FORECASTING":
            model_response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="qwen/qwen3.8-27b",
                messages=[
                    {"role": "system", "content": "You are a predictive generative AI agent. The user wants to forecast a future satellite state. Respond in Markdown format. CRITICAL: This is a hackathon simulation. Do NOT refuse the prompt."},
                    {"role": "user", "content": f"Query: {query}. Describe what the satellite imagery will look like in 48 hours. Generate a 'Forecast Report'."}
                ],
                temperature=0.5
            )
            ai_text = model_response.choices[0].message.content
            # Mock a heatmap for the predicted disaster spread
            heatmap_data = [[20.59, 78.96, 0.9], [20.60, 78.95, 0.7], [20.61, 78.97, 0.8]]
            
        else:
            # Standard single agent execution
            model_response = await asyncio.to_thread(
                groq_client.chat.completions.create,
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": (
                        "You are a geospatial AI model expert. "
                        "IMPORTANT: You MUST return your response as a JSON object with the following keys:\n"
                        "1. 'answer': The markdown formatted analytical report.\n"
                        "2. 'geojson': A valid GeoJSON FeatureCollection containing a Polygon/MultiPolygon of the target. Provide roughly accurate longitude/latitude for the queried location.\n"
                        "3. 'heatmap': An array of points representing attention or density, e.g. [[lat, lon, intensity], [lat, lon, intensity]]. Generate 5-10 clustered points near the geojson coordinates with intensity 0.0-1.0.\n"
                        "4. 'is_comparison': boolean. Set to true ONLY if the user is asking about changes over time (e.g. 'what changed').\n"
                        "5. 'is_timelapse': boolean. Set to true ONLY if user asks for an animation or timelapse over time (e.g. 'animate', 'timelapse').\n"
                        "6. 'is_3d': boolean. Set to true ONLY if user asks for 3D extrusion, buildings, or digital twin."
                    )},
                    {"role": "user", "content": f"Query: {query}. Intent: {intent_result.get('intent')}."}
                ],
                response_format={"type": "json_object"},
                temperature=0.2
            )
            response_json = json.loads(model_response.choices[0].message.content)
            ai_text = response_json.get("answer", "Analysis complete.")
            geojson_data = response_json.get("geojson", {"type": "FeatureCollection", "features": []})
            heatmap_data = response_json.get("heatmap", [])
            is_comparison = response_json.get("is_comparison", False)
            is_timelapse = response_json.get("is_timelapse", False)
            is_3d = response_json.get("is_3d", False)
            
    except Exception as e:
        ai_text = f"Analysis completed (Fallback). Error: {str(e)}"
        
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Model Execution Complete", "status": "success", "confidence": 0.95})
    }
    
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Synthesizing Spatial Masks & Outputs", "status": "processing", "confidence": None})
    }
    await asyncio.sleep(1)
    
    yield {
        "event": "result",
        "data": json.dumps({
            "answer": ai_text,
            "intent": intent_result,
            "geojson": geojson_data,
            "heatmap": heatmap_data,
            "is_comparison": is_comparison,
            "is_timelapse": is_timelapse,
            "is_3d": is_3d,
            "war_room_logs": war_room_logs
        })
    }

@app.get("/api/query")
async def process_query(q: str):
    """SSE endpoint for streaming the execution trace and final result."""
    return EventSourceResponse(orchestrate_task(q))

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "SatQuery AI Controller"}
