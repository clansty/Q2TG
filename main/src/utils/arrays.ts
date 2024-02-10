export default {
  pagination<T>(arr: T[], pageSize: number, currentPage: number) {
    const skipNum = currentPage * pageSize;
    return (skipNum + pageSize >= arr.length) ? arr.slice(skipNum, arr.length) : arr.slice(skipNum, skipNum + pageSize);
  },
};
