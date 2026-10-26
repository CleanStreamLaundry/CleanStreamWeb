export default {
  test: {
    include: ["scripts/auth-refresh/apply.test.mjs"],
    environment: "node",
    maxWorkers: 1,
    fileParallelism: false,
  },
};
