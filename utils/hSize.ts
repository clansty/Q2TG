export default (size: number) => {
    const BYTE = 1024

    if (size < BYTE)
        return size + 'B'
    if (size < Math.pow(BYTE, 2))
        return (size / BYTE).toFixed(1) + 'KB'
    if (size < Math.pow(BYTE, 3))
        return (size / Math.pow(BYTE, 2)).toFixed(1) + 'MB'
    if (size < Math.pow(BYTE, 4))
        return (size / Math.pow(BYTE, 3)).toFixed(1) + 'GB'
    return (size / Math.pow(BYTE, 4)).toFixed(1) + 'TB'
}
