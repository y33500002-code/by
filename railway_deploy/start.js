/**
 * start.js — Bot + Server birga ishga tushiradi
 * Railway da bitta process sifatida ishlaydi
 */
require("dotenv").config();
const { spawn } = require("child_process");

function run(name, file) {
  const proc = spawn("node", [file], {
    stdio: "inherit",
    env: process.env,
  });

  proc.on("exit", (code) => {
    console.error(`[${name}] jarayon to'xtadi (code: ${code}). Qayta ishga tushirilmoqda...`);
    setTimeout(() => run(name, file), 3000);
  });

  proc.on("error", (err) => {
    console.error(`[${name}] xato:`, err.message);
    setTimeout(() => run(name, file), 3000);
  });

  console.log(`[${name}] ishga tushdi: node ${file}`);
  return proc;
}

// Backend server va bot birga ishga tushadi
run("SERVER", "backend/server.js");
run("BOT",    "bots/kino/index.js");
