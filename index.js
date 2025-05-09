import { GoogleGenAI, Type } from "@google/genai";
import readline from "node:readline/promises";
import { exit, stdin as input, stdout as output } from "node:process";
import "dotenv/config";
import { execSync } from "node:child_process";
import chalk from "chalk";
import fs from "node:fs/promises"
import path from "node:path";

let currentDir = process.cwd()

const rl = readline.createInterface({ input, output });
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_KEY,
});

async function write_file({ filename, content }) {
    try {
      const filePath = path.resolve(currentDir, filename);
      await fs.writeFile(filePath, content, "utf-8");
      return `sucessfully wrote to ${filePath}` 
    } catch (error) {
      console.error(error.message)
      return `Failed to write file.`
    }
}

async function run_command(command) {
  try {
    const exec = await rl.question("\n You want to execute this command " + chalk.yellow.bold("'" + command + "'") + chalk.green("(y/n) ") + "> ");

    if (exec === "n") exit();

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

async function run_query() {
  console.log("control reached");
  try {
    const queryOutput = await rl.question("> ");
    return queryOutput;
    
  } catch(error) {
    console.error("Error:", error.message);
    return error.status;
  }
}

const available_tools = {
  run_command: {
    fn: run_command,
    description:
      "Takes a command as input to execute on system and returns ouput",
  },
  run_query: {
    fn: run_query,
    description:
      "Takes no input, rather gets some context from the user about some situation where not able to decide what to do and returns queryOutput",
  },
  write_file: {
    fn: write_file,
    description:
      "Writes content to a given filename. Input format: { filename: string, content: string }",
  },
};

const system_prompt = `You are an helpfull AI Assistant who is specialized in resolving user query.

You work on start, plan, action, observe mode.

For the given user query and available tools, plan the step by step execution, based on the planning, select the relevant tool from the available tool. and based on the tool selection you perform an action to call the tool.

Wait for the observation and based on the observation from the tool call resolve the user query.

Follow the steps in sequence that is "plan", "action", "observe" and finally "output". Where we can use "plan", "action" & "observe" in a cyclic manner to achieve the output task in a step by step manner. 

Rules:
1. Follow the strict JSON output as per Output schema.
2. Always perform one step at a time and wait for next input
3. Carefully analyse the user query

Output Type: JSON 

Output Format:
{ "step": "string", "content": "string", "function" : "the name of function if the step is action", "input": "The input parameter for the function (it may be not present for some tools e.g. run_query)"}
 
Available Tools:
- run_command : Takes a command as input to execute on system and returns output,
- run_query : Takes no input, rather gets some context from the user about some situation where not able to decide what to do and returns queryOutput,
- write_file : Writes content to a given filename. Input format: { filename: string, content: string }

Example 1:
    User Query: Create a file here
    Output: { "step": "plan", "content": "User doesn't provide any name of file."}
    Output: { "step": "plan", "content": "I have to call the run_query tool to ask for it" }
    Output: { "step": "action", "function": "run_query" }
    Output: { "step": "observe", "content": "Got the file name." }
    Output: { "step": "plan", "content": "Now I have to create the required file."}
    Output: { "step": "plan", "content": "I have to call the run_command tool to create it" }
    Output: { "step": "action", "function": "run_command", "input": "touch app.js" }
    Output: { "step": "observe", "content": "Created the file sucessfully." }
    Output: { "step": "output", "content": "Successfully created the backend server on the myfiles using JS" }

Example 2:
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

Example 3:
    User Query: Create a snake game in python file snake.py
    Output: { "step": "plan", "content": "I have to write a snake game in snake.py"}
    Output: { "step": "plan", "content": "I have to call the write_file tool to do it" }
    Output: { "step": "action", "function": "write_file", input: {"filename" : "snake.py", "content": "the snake game code"} }
    Output: { "step": "observe", "content": "Created the file with code." }
    Output: { "step": "output", "content": "Successfully created the snake game in snake.py" }
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

    let first = true;
    while (true) {
      const result = await chat.sendMessage({
        message: first ? query : "",
      });
      first = false;


      try {
        // console.log(parsed)
        const parsed = await JSON.parse(result.text);
        console.log(
            chalk.bgBlackBright(
          `\n ${emoji.get(
            parsed.step.toUpperCase()
          )} ${chalk.blue.bold(parsed.step.toUpperCase())}: ${parsed.step.toUpperCase() === "ACTION" ? parsed.function : parsed.content}`)
        );
        if (parsed.step.toUpperCase() === "ACTION") {
          const toolName = parsed.function;
          const toolInput = parsed.input;

          if (available_tools[toolName] && toolName === 'run_query') {
            const output = await available_tools[toolName]["fn"]();
          
            history.push({
              role: "model",
              parts: [
                { text: JSON.stringify({ step: "observe", content: output }) },
              ],
            });
          }

          else if (available_tools[toolName]) {
            const output = await available_tools[toolName]["fn"](toolInput);
            // await chat.sendMessage({ message: JSON.stringify(output) });

            history.push({
              role: "model",
              parts: [
                { text: JSON.stringify({ step: "observe", content: output || "" }) },
              ],
            });
          }
        } else {
          history.push({
            role: "model",
            parts: [{ text: JSON.stringify(parsed) }],
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
