import { GoogleGenAI, Type } from "@google/genai";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import "dotenv/config";
import { execSync } from "node:child_process";
import chalk from "chalk";
import path from "node:path";

let currentDir = process.cwd()

const rl = readline.createInterface({ input, output });
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_KEY,
});

async function run_command(command) {
  try {
    const exec = await rl.question("\n You want to execute this command " + chalk.yellow.bold("'" + command + "'") + chalk.green("(y/n) ") + "> ");

    if (exec === "n") return "Permission denied";

    if (command.startsWith("cd")) {
        const target = command.replace("cd ", "").trim();
        const newPath = path.resolve(currentDir, target);
        currentDir = newPath;
        return `Changed directory to ${currentDir}`
    }

    const output = execSync(command, { stdio: "inherit", cwd: currentDir});
    return output;
  } catch (error) {
    console.error("Error:", error.message);
    return error.status;
  }
}

const avaiable_tools = {
  run_command: {
    fn: run_command,
    description:
      "Takes a command as input to execute on system and returns ouput",
  },
};

const system_prompt = `You are an helpfull AI Assistant who is specialized in resolving user query.

You work on start, plan, action, observe mode.

For the given user query and available tools, plan the step by step execution, based on the planning, select the relevant tool from the available tool. and based on the tool selection you perform an action to call the tool.

Wait for the observation and based on the observation from the tool call resolve the user query.

Follow the steps in sequence that is "plan", "action", "observe" and finally "output".

Rules:
1. Follow the strict JSON output as per Output schema.
2. Always perform one step at a time and wait for next input
3. Carefully analyse the user query

Output Type: JSON 

Output Format:
{ "step": "string", "content": "string", "function" : "the name of function if the step is action", "input": "The input parameter for the function"}
 
Available Tools:
- run_command : Takes a command as input to execute on system and returns output

Example:
    User Query: Create a backend Server using express in JS in myfile
    Output: { "step": "plan", "content": "Lets check what is my current path, does it contains the myfile folder"}
     Output: { "step": "plan", "content": "I have to call the run_command tool to check it" }
    Output: { "step": "action", "function": "run_command", "input": "pwd" }
    Output: { "step": "observe", "content" : "It seems like I am not inside the correct folder" }
    Output: { "step": "plan", "content": "I am not in the myfile folder then I have to go to myfile folder first."}
     Output: { "step": "plan", "content": "I have to call the run_command tool to change the directorty" }
    Output: { "step": "action", "function": "run_command", "input": "cd myfile" }
    Output: { "step": "observe", "content" : "Now I am in the myfile folder. Here I have to initialize the project" }
    Output: { "step": "plan", "content": "The user is interseted in Creating a backend server using JS." }
    Output: { "step": "plan", "content": "I have to install express library as per requirement." }
    Output: { "step": "plan", "content": "I have to call the run_command tool to install it" }
    Output: { "step": "action", "function": "run_command", "input": "npm install express" }
    Output: { "step": "observe", "output": "Installed Express Library Successfully. Now I have to write code files for the backend server." }
    Output: { "step": "plan", "content": "I have to write code files for backend servers ." }
    Output: { "step": "plan", "content": "I have to call the run_command tool to write the index.js file in it" }
    Output: { "step": "action", "function": "run_command", "input": "touch index.js" }
    Output: { "step": "observe", "output": "Created the required file" }
    ...
    Output: { "step": "output", "content": "Successfully created the backend server on the myfiles using JS" }
`;

// Here I am using the concept of "chain of thought".

const history = [];
const emoji = new Map([
  ["PLAN", "🧠"],
  ["OUTPUT", "✅"],
  ["OBSERVE", "💭"],
  ["ACTION", "🤖"],
]);

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
    const query = await rl.question("\n > ");
    if (query.toLowerCase() === "exit") break;

    history.push({ role: "user", parts: [{ text: query }] });

    while (true) {
      const result = await chat.sendMessage({
        message: query,
      });

      try {
        const parsed = JSON.parse(result.text);
        console.log(
            chalk.bgBlackBright(
          `\n ${emoji.get(
            parsed.step.toUpperCase()
          )} ${chalk.blue.bold(parsed.step.toUpperCase())}: ${parsed.content}`)
        );
        if (parsed.step.toUpperCase() === "ACTION") {
          const toolName = parsed.function;
          const toolInput = parsed.input;

          if (avaiable_tools[toolName]) {
            const output = await avaiable_tools[toolName]["fn"](toolInput);
            // await chat.sendMessage({ message: JSON.stringify(output) });

            history.push({
              role: "model",
              parts: [
                { text: JSON.stringify({ step: "observe", content: output | "" }) },
              ],
            });
          }
        } else {
          history.push({
            role: "model",
            parts: [{ text: JSON.stringify(parsed.content) }],
          });
        }

        if (parsed.step.toUpperCase() === "OUTPUT") break;
      } catch (error) {
        console.error("☠️ Error happened. Raw Response: ", result.text);
        break;
      }
    }
  }

  rl.close();
}

await main();
