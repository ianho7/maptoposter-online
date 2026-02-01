import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'MapPosterDB';
const STORE_NAME = 'geojson-cache';
const VERSION = 1;

export async function getDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
}

/**
 * 压缩数据
 */
export async function compress(data: string): Promise<Blob> {
    const stream = new Blob([data]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    return new Response(compressedStream).blob();
}

/**
 * 解压数据
 */
export async function decompress(blob: Blob): Promise<string> {
    const stream = blob.stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    return new Response(decompressedStream).text();
}
