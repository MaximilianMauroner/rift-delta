export const BUCKET_OBJECT_CONCURRENCY: 16
export function mapBucketObjects<T, R>(items: Iterable<T>, operation: (item: T, index: number) => Promise<R>): Promise<R[]>
