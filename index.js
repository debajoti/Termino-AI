import { GoogleGenAI, Type } from "@google/genai";
import readline from "node:readline/promises"; // Use promises version
import { stdin as input, stdout as output } from "node:process";
import 'dotenv/config'

console.log(process.env.GEMINI_KEY)

const ai = new GoogleGenAI({
  apiKey: process.env.GEMENI_KEY,
});

const system_prompt = `You are an AI assistant who is expert in breaking down complex problems and then resolve the user query.

For the given user input, analyse the input and break down the problem step by step.
Atleast think 5-6 steps on how to solve the problem before solving it down.

The steps are you get a user input, you analyse, you think, you again think for several times and then return an output with explanation and then finally you validate the output as well before giving final result.

Follow the steps in sequence that is "analyse", "think", "output", "validate" and finally "result".

Rules:
1. Follow the strict JSON output as per Output schema.
2. Always perform one step at a time and wait for next input
3. Carefully analyse the user query

Output Type: JSON 

Output Format:
{ "step": "string", "content": "string" }`;

// Here I am using the concept of "chain of thought". 

const rl = readline.createInterface({ input, output });
const history = []
const emoji = new Map([
    ["ANALYSE", "🧠"],
    ["THINK", "🤔"],
    ["RESULT", "✅"],
    ["VALIDATE", "💭"],
    ["OUTPUT", "🤖"]
])

async function main() {
  const chat = ai.chats.create({
    model: "gemini-2.0-flash",
    history: history,
    config: {
      systemInstruction: system_prompt,
      responseMimeType: "application/json",
    },
  });

  while (true) {
    const query = await rl.question("> ");
    if (query.toLowerCase() === "exit") break;

    history.push({role: "user", parts: [{text: query}]});

    while (true) {
        const result = await chat.sendMessage({
            message: query,
        });
        
        try {
            const parsed = JSON.parse(result.text);
            console.log(`${emoji.get(parsed.step.toUpperCase())} ${parsed.step.toUpperCase()}: ${parsed.content}`);
            history.push({role: "model", parts: [{text: JSON.stringify(parsed.content)}]})

            if (parsed.step.toUpperCase() === "RESULT") break;
        } catch (error) {
            console.error("☠️ Error happened. Raw Response: ", result.text)
            break;
        }
    }  
  }

  rl.close();
}

await main();
console.log(history)