type CallTreeNode = {
    name: string,
    calls: Array<CallTreeNode>,
    parent?: CallTreeNode
}
const CallTreeNode = {
    newRoot: (name: string): CallTreeNode => ({ name, calls: [] }),
    new: (name: string, parent: CallTreeNode): CallTreeNode => ({ name, calls: [], parent })
}

export default CallTreeNode