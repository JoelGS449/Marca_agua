# Sello

Agrega tu nombre y la fecha y hora en que se tomó cada foto como marca de agua. La fecha se lee de los metadatos EXIF de la imagen. Todo se procesa en el navegador; las fotos nunca se suben a ningún servidor.

Hecho con Vue 3 + Vite, [exifr](https://github.com/MikeKovarik/exifr) para leer metadatos y JSZip para descargas múltiples.

## Desarrollo

El acceso requiere iniciar sesión contra el backend **Sello API** (repositorio aparte, Django), donde se administran los usuarios, sus perfiles y las herramientas que cada perfil puede usar. Levántalo primero en el puerto 8000; ver su README.

```bash
npm install
npm run dev      # abre la URL de red en tu teléfono (mismo WiFi)
npm run build    # genera dist/
```

Por defecto el front busca la API en el puerto 8000 del mismo host. En producción define `VITE_API_URL` con la URL pública del backend (en Vercel: Settings → Environment Variables, y vuelve a desplegar).

## Publicación

Cada push a `main` se publica automáticamente en GitHub Pages mediante `.github/workflows/deploy.yml`. Define la variable de repositorio `VITE_API_URL` con la URL pública del backend.
