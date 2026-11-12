import { Command } from "./types.js";
import { unlink } from "./unlink.js";
import { verify } from "./verify.js";
import { whois } from "./whois.js";

export const commands: Command[] = [verify, unlink, whois];
