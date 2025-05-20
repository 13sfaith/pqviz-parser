#!/usr/bin/env node 
import fs from 'fs';
import { stringify } from 'flatted';
import { parseTrace } from './parser/traceParser.js';

const trace = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

console.log(stringify(parseTrace(trace)))

