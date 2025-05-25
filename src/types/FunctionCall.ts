type FunctionCall = {
    type: "functionCall",
    from: string,
    to: string,
    callingFile: string,
    callingLine: number,
    args: Array<any>,
    index: number
}

export default FunctionCall