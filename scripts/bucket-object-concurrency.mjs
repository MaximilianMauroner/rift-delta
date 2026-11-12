export const BUCKET_OBJECT_CONCURRENCY = 16

export async function mapBucketObjects(items, operation) {
  const values = [...items]
  const results = new Array(values.length)
  let next = 0
  let failed = false
  let firstError
  async function worker() {
    while (!failed && next < values.length) {
      const index = next++
      try {
        results[index] = await operation(values[index], index)
      } catch (error) {
        if (!failed) firstError = error
        failed = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BUCKET_OBJECT_CONCURRENCY, values.length) }, worker))
  if (failed) throw firstError
  return results
}
