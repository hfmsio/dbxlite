/**
 * Low-level binary stream reader wrapping DataView with offset tracking.
 * Vendored from duckdb-ui with MIT license.
 */
export class BinaryStreamReader {
  private dv: DataView
  private offset: number

  constructor(buffer: ArrayBuffer) {
    this.dv = new DataView(buffer)
    this.offset = 0
  }

  getOffset(): number {
    return this.offset
  }

  peekUint8(): number {
    return this.dv.getUint8(this.offset)
  }

  peekUint16(littleEndian: boolean): number {
    return this.dv.getUint16(this.offset, littleEndian)
  }

  consume(byteCount: number): void {
    this.offset += byteCount
  }

  private offsetBeforeConsume(byteCount: number): number {
    const offsetBefore = this.offset
    this.consume(byteCount)
    return offsetBefore
  }

  readUint8(): number {
    return this.dv.getUint8(this.offsetBeforeConsume(1))
  }

  readUint16(littleEndian: boolean): number {
    return this.dv.getUint16(this.offsetBeforeConsume(2), littleEndian)
  }

  readUint32(littleEndian: boolean): number {
    return this.dv.getUint32(this.offsetBeforeConsume(4), littleEndian)
  }

  readFloat64(littleEndian: boolean): number {
    return this.dv.getFloat64(this.offsetBeforeConsume(8), littleEndian)
  }

  readData(length: number): DataView {
    return new DataView(this.dv.buffer, this.offsetBeforeConsume(length), length)
  }

  readBytes(length: number): Uint8Array {
    const start = this.offsetBeforeConsume(length)
    return new Uint8Array(this.dv.buffer, start, length)
  }

  hasMore(): boolean {
    return this.offset < this.dv.byteLength
  }

  remaining(): number {
    return this.dv.byteLength - this.offset
  }
}
