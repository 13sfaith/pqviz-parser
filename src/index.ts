#!/usr/bin/env node 

import fs from 'fs';
import { parseTrace} from './parser/traceParser';

const trace = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
console.log(parseTrace())

