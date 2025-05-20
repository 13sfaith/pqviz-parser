import path from 'path'
import TraceType from '../types/TraceType.js';
import CallTreeNode from '../types/CallTreeNode.js';

var trace: Array<TraceType>;

export function parseTrace(inputTrace: Array<TraceType>) {
  trace = inputTrace
  return processTrace()
}

function processTrace() {
    addTraceIndex()

    renameConstructor()

    renameTLS()

    let imports = buildImportMap()
    let root = buildCallTree(imports)

    return root
}

function addTraceIndex() {
    for (let i = 0; i < trace.length; i++) {
        trace[i].index = i
    }
}

function renameConstructor() {
    for (let i = 0; i < trace.length; i++) {
        if (trace[i].from == 'constructor') {
            trace[i].from = '_constructor'
        }
        if (trace[i].to == 'constructor') {
            trace[i].to = '_constructor'
        }
    }
}

function renameTLS() {
    let currentTop = 'TLS'
    for (let i = 0; i < trace.length; i++) {
        if (trace[i].type == 'moduleStart') {
            currentTop = trace[i].file || '' 
        }

        if (!['functionCall', 'functionReturn'].includes(trace[i].type)) {
            continue
        }

        if (trace[i].from == 'TLS') {
            trace[i].from = trace[i].callingFile
        }
        if (trace[i].to == 'TLS') {
            trace[i].to = currentTop
        }
    }
}

type importDefinition = {
    sourcePath: string,
    importPath: string
}

function buildImportMap(): Array<importDefinition> {
    let imports: Array<importDefinition> = []

    for (let i = 0; i < trace.length; i++) {
        if (trace[i].type != 'import') {
            continue
        }
        if (trace[i].sourcePath?.includes('node_modules') || trace[i].sourcePath?.includes('node:')) {
            continue
        }
        if (trace[i].importPath?.includes('node_modules') || trace[i].importPath?.includes('node:')) {
            continue
        }
        if (trace[i].importPath?.includes('monitor/monitor.js')) {
            continue
        }

        imports.push({ sourcePath: stripTmpDirectory(trace[i].sourcePath), importPath: stripTmpDirectory(trace[i].importPath) })
    }

    if (imports[0].sourcePath == '') {
        imports[0].sourcePath = 'Entry'
    }

    return imports
}

type functionCall = {
    type: "functionCall",
    from: string,
    to: string,
    callingFile: string,
    callingLine: number,
    args: Array<any>,
    index: number
}

type functionReturn = {
    type: "functionReturn",
    from: string,
    to: string,
    callingFile: string,
    callingLine: number,
    index: number
}

type functionStart = {
    type: "functionStart",
    name: string,
    file: string,
    line: number
    index: number
}

function isFunctionCall(x: any): x is functionCall {
    return x.type == "functionCall"
}

function isFunctionReturn(x: any): x is functionReturn {
    return x.type == "functionReturn"
}

function buildCallTree(imports: Array<importDefinition>): CallTreeNode {
    let root: CallTreeNode = {} as CallTreeNode

    root.name = imports[0].sourcePath
    root.calls = []

    let currentNode: CallTreeNode = {} as CallTreeNode
    currentNode = root

    for (let i = 0; i < imports.length; i++) {
        let searchResult: WalkUpResult = walkUpTreeTillNodeFound(currentNode, imports[i].sourcePath)
        if (searchResult.found == false) {
            break
        }
        currentNode = searchResult.node

        let callNode: CallTreeNode = {} as CallTreeNode
        callNode.name = imports[i].importPath
        callNode.calls = []
        callNode.parent = currentNode

        currentNode.calls.push(callNode)
        currentNode = callNode
    }

    let functionCalls: Array<functionCall> = trace.filter((a: TraceType) => a.type == 'functionCall') as Array<functionCall>
    for (let i = 0; i < functionCalls.length; i++) {
        let firstCall: functionCall = functionCalls[i]
        currentNode = findFirstCall(root, firstCall.from)
        if (currentNode.name == "") {
            console.error("unable to find find called node")
            console.log("First Call Name: ", firstCall.from)
            console.log("root")
            console.log(root)
        } else {
            break;
        }
    }

    populateCallTreeWithFunctionCalls(currentNode)

    return root
}

function populateCallTreeWithFunctionCalls(currentNode: CallTreeNode) {

    for (let i = 0; i < trace.length - 1; i++) {
        if (trace[i].type != 'functionCall') {
            continue
        }
        if (trace[i+1].type != 'functionStart') {
            continue
        }
        let functionCall = trace[i] as functionCall
        let functionStart = trace[i+1] as functionStart

        if (functionCall.to == functionStart.name) {
            continue;
        }

        let currentIndex = i
        for (; currentIndex < trace.length; currentIndex++) {
            if (isFunctionReturn(trace[currentIndex])) {
                let returnNode = trace[currentIndex] as functionReturn
                if (returnNode.from == functionCall.from && returnNode.to == functionCall.to && returnNode.callingLine == functionCall.callingLine) {
                    break
                }
            }
            if (trace[currentIndex].type != 'functionCall') {
                continue
            }
            let currentNode = trace[currentIndex] as functionCall
            if (currentNode.from != functionStart.name) {
                continue
            }
            currentNode.from = functionCall.to
        }
    }

    let functionCalls: Array<functionCall> = trace.filter((a) => a.type == 'functionCall') as Array<functionCall>

    for (let i = 0; i < functionCalls.length; i++) {
        if (!isFunctionCall(functionCalls[i])) {
            continue;
        }
        let currentFunction = functionCalls[i] as functionCall

        if (currentFunction.from != currentNode.name) {
            let searchResult: WalkUpResult = walkUpTreeTillNodeFound(currentNode, currentFunction.from)
            if (searchResult.found == false) {
                let newFunctionCall: CreateFunctionCallResult = createCorrectFunctionCall(functionCalls[i])
                if (newFunctionCall.success == true) {
                    functionCalls.splice(i, 0, newFunctionCall.functionCall)
                    i--
                }
                continue
            }
            currentNode = searchResult.node
        }

        let newNode = CallTreeNode.new(currentFunction.to, currentNode)
        currentNode.calls.push(newNode)

        currentNode = newNode
    }
}

type CreateFunctionCallResult = 
    | { success: true; functionCall: functionCall }
    | { success: false }

const CreateFunctionCallResult = {
    found: (functionCall: functionCall): CreateFunctionCallResult => ({ success: true, functionCall }),
    notFound: (): CreateFunctionCallResult => ({ success: false })
}

function createCorrectFunctionCall(functionCall: functionCall): CreateFunctionCallResult {
    let currentIndex = functionCall.index

    while (currentIndex > 0 && trace[currentIndex].type != 'functionReturn') {
        currentIndex--;
    } 
    if (currentIndex < 0) {
        throw Error('shoot, we were not able to generate the correct function call')
        return CreateFunctionCallResult.notFound()
    }

    let returnCount = 1
    let callCount = 0

    for (; currentIndex > 0; currentIndex--) {
        if (returnCount == callCount) {
            break
        }
        if (trace[currentIndex].type == "functionCall") {
            callCount++
        }
        if (trace[currentIndex].type == "functionReturn") {
            returnCount++
        }
    }

    if (returnCount != callCount) {
        console.error("Result count hack did not work")
        return CreateFunctionCallResult.notFound()
    }
    currentIndex++

    let referenceCall = trace[currentIndex] as functionCall

    let ret = {
        type: 'functionCall',
        from: referenceCall.to,
        to: functionCall.from,
        callingFile: referenceCall.callingFile,
        callingLine: referenceCall.callingLine,
        args: referenceCall.args,
        index: -1,
    } as functionCall

    return CreateFunctionCallResult.found(ret)
}

function stripTmpDirectory(dir: string | undefined) {
    dir = dir || ''
    let dirPieces = dir.split(path.sep)
    let tmpIndex = dirPieces.findIndex((a) => {
        return a.includes('tmp-')
    })

    return dirPieces.splice(tmpIndex + 1).join(path.sep)
}

// Depth first search to find a node
function findFirstCall(root: CallTreeNode, call: string): CallTreeNode {
    let currentNode = root

    if (currentNode.name == call) {
        return currentNode
    }

    for (let i = 0; i < currentNode.calls.length; i++) {
        let foundNode = findFirstCall(currentNode.calls[i], call)
        if (foundNode.name != "") {
            return foundNode
        }
    }

    return { name: "" } as CallTreeNode
}

type WalkUpResult = 
    | { found: true; node: CallTreeNode }
    | { found: false }

const WalkUpResult = {
    found: (node: CallTreeNode): WalkUpResult => ({ found: true, node }),
    notFound: (): WalkUpResult => ({ found: false })
}

/**
 * Expects some node in a tree.
 * Will go up one parent at a time looking for a node of name `name`. 
 * If the name is a file will also check the children at each node.
 * @param referenceNode The node to start searching from
 * @param name The desired node name we are searching for
 * @returns If found, the node named `name`, else undefined node `{ name: "" }`
 */
function walkUpTreeTillNodeFound(referenceNode: CallTreeNode, name: string): WalkUpResult {
    let currentNode = referenceNode
    while (currentNode.name != name) {
        if (currentNode.name.endsWith('.js')) {
            for (let i = 0; i < currentNode.calls.length; i++) {
                if (currentNode.calls[i].name == name)  {
                    return WalkUpResult.found(currentNode.calls[i])
                }
            }
        }

        if (currentNode.parent == undefined) {
            return WalkUpResult.notFound()
        }

        currentNode = currentNode.parent
    }
    return WalkUpResult.found(currentNode)
}

function printCallTree(root: CallTreeNode, level: number = 0) {
    let current = root
    console.log("-".repeat(level), current.name)

    for (let i = 0; i < current.calls.length; i++) {
        printCallTree(current.calls[i], level + 1)
    }
}
