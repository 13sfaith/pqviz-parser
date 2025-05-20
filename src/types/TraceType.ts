type TraceType = {
    type: string,
    name?: string,
    from?: string,
    to?: string,
    callingFile?: string,
    file?: string,
    callingLine?: number,
    line?: number,
    args?: Array<string>,
    sourcePath?: string,
    importPath?: string,
    index: number,
}

export default TraceType