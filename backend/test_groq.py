import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
try:
    print(f"API Key starts with: {os.environ.get('GROQ_API_KEY', '')[:5]}")
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Say 'hello world'"}],
        max_tokens=10
    )
    print("Success:", response.choices[0].message.content)
except Exception as e:
    print("Error:", str(e))
