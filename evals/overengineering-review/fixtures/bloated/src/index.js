import { Greeter } from "./greeter.js";

console.log(new Greeter().greet(process.argv[2] ?? "world"));
