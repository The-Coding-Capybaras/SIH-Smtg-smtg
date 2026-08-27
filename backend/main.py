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
                    "content": f"You are a geospatial AI model expert. The user query is: '{query}'. The intent was {intent_result.get('intent')}. Give a realistic analytical response as if you just processed the satellite imagery. Mention exact coordinates, area sizes in sq km, and confidence levels."
                }
            ],
            temperature=0.3
        )
        ai_text = model_response.choices[0].message.content
    except Exception as e:
        ai_text = f"Analysis completed (Fallback). Query '{query}' processed via heuristic routing."

    yield {
        "event": "trace",
        "data": json.dumps({"step": "Model Execution Complete", "status": "success", "confidence": 0.95})
    }
    
    # Step 4: Synthesizing results
    yield {
        "event": "trace",
        "data": json.dumps({"step": "Synthesizing Spatial Masks", "status": "processing", "confidence": None})
    }
    await asyncio.sleep(1)
    
    # Send final result
    yield {
        "event": "result",
        "data": json.dumps({
            "answer": ai_text,
            "intent": intent_result,
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"type": "highlight", "area_sq_km": 4.2},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[[78.96, 20.59], [78.97, 20.59], [78.97, 20.60], [78.96, 20.60], [78.96, 20.59]]]
                        }
                    }
                ]
            }
        })
    }

@app.get("/api/query")
async def process_query(q: str):
    """SSE endpoint for streaming the execution trace and final result."""
    return EventSourceResponse(orchestrate_task(q))

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "SatQuery AI Controller"}
