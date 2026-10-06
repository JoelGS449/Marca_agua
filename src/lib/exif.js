import exifr from 'exifr'

/**
 * Obtiene la fecha en que se tomó la foto desde los metadatos EXIF.
 * Si no existe, usa la fecha de modificación del archivo como respaldo.
 */
export async function readTakenDate(file) {
  try {
    const data = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'ModifyDate'],
    })
    const date = data?.DateTimeOriginal || data?.CreateDate || data?.DateTimeDigitized || data?.ModifyDate
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return { date, source: 'exif' }
    }
  } catch {
    // Archivo sin EXIF o formato no soportado por el lector: usamos el respaldo.
  }
  return { date: new Date(file.lastModified || Date.now()), source: 'file' }
}
