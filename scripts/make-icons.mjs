/**
 * Renders the rdr mark into every Android launcher, adaptive-icon and
 * splash bitmap, plus a 512 px Play Store icon. Run: bun run icons
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const res = path.join(root, 'android/app/src/main/res')
const iconSvg = await readFile(path.join(root, 'assets/icon.svg'))
const fgSvg = await readFile(path.join(root, 'assets/icon-foreground.svg'))

const SPLASH_BG = '#f4f2f7'
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const render = (svg, size) => sharp(svg, { density: 900 }).resize(size, size)

async function circleMask(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/></svg>`,
  )
}

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${density}`)
  await mkdir(dir, { recursive: true })

  const legacy = Math.round(48 * scale)
  const legacyPng = await render(iconSvg, legacy).png().toBuffer()
  await writeFile(path.join(dir, 'ic_launcher.png'), legacyPng)
  await writeFile(
    path.join(dir, 'ic_launcher_round.png'),
    await sharp(legacyPng)
      .composite([{ input: await circleMask(legacy), blend: 'dest-in' }])
      .png()
      .toBuffer(),
  )

  // Adaptive foreground lives on a 108dp canvas; the art sits in the safe zone.
  const fgSize = Math.round(108 * scale)
  await writeFile(path.join(dir, 'ic_launcher_foreground.png'), await render(fgSvg, fgSize).png().toBuffer())
}

const icon192 = await render(iconSvg, 192).png().toBuffer()

for (const dirName of await readdir(res)) {
  if (!dirName.startsWith('drawable')) continue
  const dir = path.join(res, dirName)
  const files = await readdir(dir).catch(() => [])
  if (!files.includes('splash.png')) continue

  const { width, height } = await sharp(path.join(dir, 'splash.png')).metadata()
  const mark = Math.round(Math.min(width, height) * 0.3)
  const markPng = await render(iconSvg, mark).png().toBuffer()
  await sharp({ create: { width, height, channels: 4, background: SPLASH_BG } })
    .composite([{ input: markPng, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'splash.png'))
}

await mkdir(path.join(root, 'assets'), { recursive: true })
await writeFile(path.join(root, 'assets/play-store-icon-512.png'), await render(iconSvg, 512).png().toBuffer())

console.log('Icons written:', Object.keys(DENSITIES).join(', '), '+ splash + assets/play-store-icon-512.png')
