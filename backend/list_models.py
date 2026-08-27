import os
import requests
headers = {"Authorization": f"Bearer {os.environ.get('GROQ_API_KEY')}"}
response = requests.get("https://api.groq.com/openai/v1/models", headers=headers)
print([m["id"] for m in response.json().get("data", [])])
