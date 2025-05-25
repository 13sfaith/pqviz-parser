type FunctionReturn = {
    type: "functionReturn",
    from: string,
    to: string,
    callingFile: string,
    callingLine: number,
    index: number
}

export default FunctionReturn