import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const sharp = require('sharp')
const assets = fileURLToPath(new URL('../frontend/src/assets/', import.meta.url))
const output = join(assets, '_optimized')
const scriptTime = (await stat(fileURLToPath(import.meta.url))).mtimeMs
const scenes = ['login-jiaxing', 'selection-scene', 'jiaxing-spring', 'jiaxing-dusk', 'zhongnan', 'damo', 'heizhao']
const avatars = ['selection-hero', 'selection-heroine']
const portraits = (await readdir(join(assets, 'portraits'))).filter((name) => name.endsWith('.webp'))
const items = (await readdir(join(assets, 'item-illustrations'))).filter((name) => name.endsWith('.webp'))

async function fresh(path, since) {
  try { return (await stat(path)).mtimeMs >= since } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return false
  }
}

async function encode(source, folder, width, height) {
  const input = join(assets, source)
  const target = join(output, folder, basename(source))
  const original = await stat(input)
  if (await fresh(target, Math.max(scriptTime, original.mtimeMs))) return
  const image = sharp(input)
  const dimensions = await image.metadata()
  const encoded = await image.resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 }).toBuffer()
  const pending = `${target}.${process.pid}.tmp`
  if (dimensions.width <= width && (!height || dimensions.height <= height) && encoded.length >= original.size) {
    await copyFile(input, pending)
  } else {
    await writeFile(pending, encoded)
  }
  await rename(pending, target)
}

const groups = [
  ['scenes', scenes.map((name) => `${name}.webp`), 1600, 900],
  ['avatars-full', avatars.map((name) => `${name}.webp`), 800],
  ['avatars', avatars.map((name) => `${name}.webp`), 256],
  ['portraits', portraits.map((name) => `portraits/${name}`), 800],
  ['portraits-thumb', portraits.map((name) => `portraits/${name}`), 256],
  ['item-illustrations', items.map((name) => `item-illustrations/${name}`), 512],
  ['item-thumbs', items.map((name) => `item-illustrations/${name}`), 128],
]

for (const [folder, files, width, height] of groups) {
  await mkdir(join(output, folder), { recursive: true })
  for (let start = 0; start < files.length; start += 6) {
    await Promise.all(files.slice(start, start + 6).map((file) => encode(file, folder, width, height)))
  }
}

const noise = join(output, 'paper-noise.webp')
if (!(await fresh(noise, scriptTime))) {
  const width = 180
  const height = 180
  const pixels = Buffer.alloc(width * height * 4)
  let seed = 1701
  for (let offset = 0; offset < pixels.length; offset += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    pixels[offset] = 112
    pixels[offset + 1] = 99
    pixels[offset + 2] = 77
    pixels[offset + 3] = (seed >>> 24) & 0x3f
  }
  const texture = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 45, alphaQuality: 20, effort: 6 }).toBuffer()
  const pending = `${noise}.${process.pid}.tmp`
  await writeFile(pending, texture)
  await rename(pending, noise)
}
