/**
 * High-level binary deserializer for DuckDB's binary protocol.
 * Handles field IDs, VarInt encoding, strings, lists, and nested objects.
 * Vendored from duckdb-ui with MIT license.
 */
import { BinaryStreamReader } from './BinaryStreamReader'

/** Function type for reading a value from the deserializer */
export type Reader<T> = (deserializer: BinaryDeserializer) => T

/** Function type for reading list items with index */
export type ListReader<T> = (deserializer: BinaryDeserializer, index: number) => T

/** Object terminator marker (0xFFFF) */
const MESSAGE_TERMINATOR = 0xffff

const decoder = new TextDecoder()

export class BinaryDeserializer {
  public reader: BinaryStreamReader  // Public for readData access

  constructor(reader: BinaryStreamReader) {
    this.reader = reader
  }

  /** Peek at the next field ID without consuming it */
  private peekFieldId(): number {
    return this.reader.peekUint16(true) // little-endian
  }

  /** Consume the field ID (advance by 2 bytes) */
  private consumeFieldId(): void {
    this.reader.consume(2)
  }

  /** Check if the next field matches the expected ID */
  private checkFieldId(possibleFieldId: number): boolean {
    if (this.peekFieldId() === possibleFieldId) {
      this.consumeFieldId()
      return true
    }
    return false
  }

  /** Expect a specific field ID, throw if mismatch */
  private expectFieldId(expectedFieldId: number): void {
    const actual = this.peekFieldId()
    if (actual !== expectedFieldId) {
      throw new Error(
        `Expected field ID ${expectedFieldId}, got ${actual} at offset ${this.reader.getOffset()}`
      )
    }
    this.consumeFieldId()
  }

  /** Expect object end marker (0xFFFF) */
  expectObjectEnd(): void {
    this.expectFieldId(MESSAGE_TERMINATOR)
  }

  /** Throw an error for unsupported data */
  throwUnsupported(message = 'Unsupported'): never {
    throw new Error(`${message} at offset ${this.reader.getOffset()}`)
  }

  /** Read a single byte */
  readUint8(): number {
    return this.reader.readUint8()
  }

  /** Read a 16-bit unsigned integer (little-endian) */
  readUint16(): number {
    return this.reader.readUint16(true)
  }

  /** Read a 32-bit unsigned integer (little-endian) */
  readUint32(): number {
    return this.reader.readUint32(true)
  }

  /** Read a 64-bit float (little-endian) */
  readFloat64(): number {
    return this.reader.readFloat64(true)
  }

  /** Read a boolean (1 byte, 0 = false, non-zero = true) */
  readBool(): boolean {
    return this.reader.readUint8() !== 0
  }

  /**
   * Read a variable-length integer (VarInt / LEB128-like encoding).
   * Each byte uses 7 bits for value, MSB indicates continuation.
   */
  readVarInt(): number {
    let result = 0
    let shift = 0
    let byte: number

    do {
      byte = this.reader.readUint8()
      result |= (byte & 0x7f) << shift
      shift += 7
    } while (byte >= 0x80)

    return result
  }

  /**
   * Read a signed VarInt using zig-zag encoding.
   */
  readSignedVarInt(): number {
    const unsigned = this.readVarInt()
    // Zig-zag decode: (n >>> 1) ^ -(n & 1)
    return (unsigned >>> 1) ^ -(unsigned & 1)
  }

  /**
   * Read a 64-bit VarInt as BigInt for large values.
   */
  readVarInt64(): bigint {
    let result = 0n
    let shift = 0n
    let byte: number

    do {
      byte = this.reader.readUint8()
      result |= BigInt(byte & 0x7f) << shift
      shift += 7n
    } while (byte >= 0x80)

    return result
  }

  /** Read a nullable value */
  readNullable<T>(reader: Reader<T>): T | null {
    const isPresent = this.readUint8() !== 0
    if (!isPresent) {
      return null
    }
    return reader(this)
  }

  /** Read binary data (VarInt length + bytes) */
  readData(): Uint8Array {
    const length = this.readVarInt()
    return this.reader.readBytes(length)
  }

  /** Read a UTF-8 string (VarInt length + UTF-8 bytes) */
  readString(): string {
    const length = this.readVarInt()
    const bytes = this.reader.readBytes(length)
    return decoder.decode(bytes)
  }

  /** Read a list of items */
  readList<T>(reader: ListReader<T>): T[] {
    const count = this.readVarInt()
    const items: T[] = []
    for (let i = 0; i < count; i++) {
      items.push(reader(this, i))
    }
    return items
  }

  /** Read a pair of values with object end marker */
  readPair<T, U>(firstReader: Reader<T>, secondReader: Reader<U>): [T, U] {
    const first = firstReader(this)
    const second = secondReader(this)
    this.expectObjectEnd()
    return [first, second]
  }

  /** Read a required property with expected field ID */
  readProperty<T>(expectedFieldId: number, reader: Reader<T>): T {
    this.expectFieldId(expectedFieldId)
    return reader(this)
  }

  /** Read an optional property with default value */
  readPropertyWithDefault<T>(
    possibleFieldId: number,
    reader: Reader<T>,
    defaultValue: T
  ): T {
    if (this.checkFieldId(possibleFieldId)) {
      return reader(this)
    }
    return defaultValue
  }

  /** Check if more data is available */
  hasMore(): boolean {
    return this.reader.hasMore()
  }

  /** Get current offset for debugging */
  getOffset(): number {
    return this.reader.getOffset()
  }
}
