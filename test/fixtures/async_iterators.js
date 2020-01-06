async function* numbers (limit) {
  let count = 0;
  while (count <= limit) {
    yield count++;
  }
}

async function sumCount (limit) {
  let sum = 0;
  const nums = numbers(limit);
  for await (const num of nums) {
    sum += num;
  }
  return sum;
}

// Execute the code to make sure it executes without an error after transpiling
exports.handle = async (event, context, callback) => {
  const sum = await sumCount(5);
  callback(null, sum);
};
