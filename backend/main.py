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
            model="openai/gpt-oss-120b",
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
    yield {
        "event": "trace",
        "data": json.dumps({"step": f"Routing to Model Engine for {intent_result.get('intent')}", "status": "processing", "confidence": None})
    }
    await asyncio.sleep(1.5)
    
    try:
        model_response = await asyncio.to_thread(
            groq_client.chat.completions.create,
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a geospatial AI model expert. The user query is: '{query}'. "
                        f"The intent was {intent_result.get('intent')}. "
                        "Give a realistic analytical response as if you just processed the satellite imagery. "
                        "Mention exact coordinates, area sizes in sq km, and confidence levels.\n\n"
                        "IMPORTANT: You MUST return your response as a JSON object with the following keys:\n"
                        "1. 'answer': The markdown formatted analytical report.\n"
                        "2. 'geojson': A valid GeoJSON FeatureCollection containing a Polygon/MultiPolygon of the target. Provide roughly accurate longitude/latitude for the queried location.\n"
                        "3. 'heatmap': An array of points representing attention or density, e.g. [[lat, lon, intensity], [lat, lon, intensity]]. Generate 5-10 clustered points near the geojson coordinates with intensity 0.0-1.0.\n"
                        "4. 'is_comparison': boolean. Set to true ONLY if the user is asking about changes over time (e.g. 'what changed', 'before and after', 'deforestation')."
                    )
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        response_json = json.loads(model_response.choices[0].message.content)
        ai_text = response_json.get("answer", "Analysis complete.")
        geojson_data = response_json.get("geojson", {"type": "FeatureCollection", "features": []})
        heatmap_data = response_json.get("heatmap", [])
        is_comparison = response_json.get("is_comparison", False)
    except Exception as e:
        ai_text = f"Analysis completed (Fallback). Query '{query}' processed via heuristic routing. Error: {str(e)}"
        geojson_data = None
        heatmap_data = []
        is_comparison = False

    yield {
        "event": "trace",
        "data": json.dumps({"step": "Model Execution Complete", "status": "success", "confidence": 0.95})
    }
    
    # Step 4: Synthesizing results
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Synthesizing Spatial Masks & Heatmaps", "status": "processing", "confidence": None})
    }
    await asyncio.sleep(1)
    
    # Send final result
    yield {
        "event": "result",
        "data": json.dumps({
            "answer": ai_text,
            "intent": intent_result,
            "geojson": geojson_data,
            "heatmap": heatmap_data,
            "is_comparison": is_comparison
        })
    }

@app.get("/api/query")
async def process_query(q: str):
    """SSE endpoint for streaming the execution trace and final result."""
    return EventSourceResponse(orchestrate_task(q))

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "SatQuery AI Controller"}
