# Mis Finanzas

App web para tus finanzas personales que funciona en iPhone, iPad y Mac (y Android/Windows). Se instala como una app desde el navegador y sincroniza tus datos a través de un **repositorio privado de GitHub**.

**Incluye:** registro de gastos e ingresos con categorías · presupuesto mensual por categoría con alertas · gráfico de gastos por categoría y comparación de los últimos 6 meses · metas de ahorro y deudas con cálculo de cuánto apartar por mes · exportar a CSV/JSON · funciona sin conexión.

## Cómo funciona

```
 Repo PÚBLICO  "mis-finanzas"      →  GitHub Pages sirve la app (solo código, nada de datos)
 Repo PRIVADO  "finanzas-datos"    →  guarda finanzas.json con tus movimientos
```

Cada dispositivo guarda una copia local y, cuando hay internet, la fusiona con el archivo del repo privado. Si editas en el teléfono y en el Mac al mismo tiempo, los cambios se combinan (no se pisan). Cada sincronización queda como un commit, así que tienes historial completo y puedes recuperar cualquier versión.

> El código va en un repo público porque GitHub Pages en repos privados requiere un plan pagado. No hay problema: el código no contiene ningún dato tuyo.

## Instalación (una sola vez, ~10 minutos)

### 1. Publicar la app

1. Crea un repositorio **público** llamado `mis-finanzas` y sube todos los archivos de esta carpeta:
   ```bash
   cd mis-finanzas
   git init && git add . && git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/mis-finanzas.git
   git push -u origin main
   ```
2. En el repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. En un par de minutos la app queda en `https://TU-USUARIO.github.io/mis-finanzas/`.

### 2. Crear el repositorio de datos

Crea un repositorio **privado** llamado `finanzas-datos` (puede estar vacío; la app crea `finanzas.json` sola).

### 3. Crear un token de acceso

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `finanzas-datos` (solo ese).
3. **Permissions → Repository permissions → Contents: Read and write.** Nada más.
4. Elige una expiración (por ejemplo, 1 año), genera el token y cópialo.

Puedes usar el mismo token en todos tus dispositivos o crear uno por dispositivo (así puedes revocar solo el del teléfono si lo pierdes).

### 4. Configurar cada dispositivo

Abre la app → **Ajustes** → completa usuario, `finanzas-datos`, `finanzas.json` y el token → **Guardar y sincronizar**. El indicador de arriba se pone verde.

### 5. Instalarla como app

| Dispositivo | Cómo |
|---|---|
| iPhone / iPad | Safari → botón Compartir → **Agregar a inicio** |
| Mac (Safari) | Menú **Archivo → Agregar al Dock** |
| Mac (Chrome/Edge) | Ícono de instalar en la barra de direcciones |
| Android | Chrome → menú ⋮ → **Instalar app** |

## Uso diario

- **+** para registrar un gasto o ingreso (se abre el teclado numérico directo).
- **Presupuesto:** pon un límite por categoría; la barra se pone amarilla al 85% y roja al pasarte.
- **Metas:** crea una meta de ahorro o una deuda. "Abonar" / "Registrar pago" suma al avance y, si quieres, lo anota como gasto.
- La sincronización es automática unos segundos después de cada cambio y al volver a abrir la app. También puedes tocar el indicador de arriba.
- Sin internet todo sigue funcionando; se sube cuando vuelve la conexión.

## Seguridad

- Los datos viven en tu repo privado; solo tú (y quien tenga tu token) puede leerlos.
- El token queda guardado en el navegador de cada dispositivo. Usa el bloqueo de pantalla y, si pierdes un equipo, revoca su token en GitHub.
- El token solo tiene acceso al repo `finanzas-datos`, nunca a tus otros repos.

## Actualizar la app

Edita los archivos, haz commit y push. Para forzar que los dispositivos tomen la versión nueva al instante, cambia `finanzas-v1` por `finanzas-v2` en `sw.js`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la app y formularios |
| `styles.css` | Diseño (modo claro y oscuro automático) |
| `app.js` | Lógica: movimientos, presupuesto, metas, gráficos y sincronización |
| `sw.js` | Permite usarla sin conexión |
| `manifest.webmanifest`, `icon*` | Instalación como app |
