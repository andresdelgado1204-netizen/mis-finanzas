# Mis Finanzas

App de finanzas personales para iPhone, iPad y Mac. Se instala desde el navegador y guarda tus datos en tu cuenta, así que lo que anotas en el teléfono aparece al instante en el computador, y al revés.

**App:** https://misfinanzashoy.pages.dev/

## Qué hace

- Gastos e ingresos (ingresos en **efectivo** o **transferencia**)
- Saldos de **Efectivo** y **Banco**, mover dinero entre cuentas y cuadrar saldo
- **Semana de pago** (de viernes a jueves): cuánto recibiste, gastaste y te queda, y cuánto puedes gastar por día
- Presupuesto mensual por categoría, gráficos y metas de ahorro o deudas
- En Ajustes, cada cuenta elige el período del resumen de Inicio: día, semana, quincena o mes
- Registro desde noviembre de 2026
- Funciona sin internet y se sincroniza cuando vuelve la conexión

## Cuentas y administración

- **Administrador:** andresdelgado1204@gmail.com. En la pestaña **Admin** ve a todas las personas, puede bloquearlas o desbloquearlas y ver sus finanzas (solo lectura). Con **Modo personal** (en Ajustes) se oculta la pestaña Admin.
- **Agregar a alguien:** Firebase → Authentication → Usuarios → **Agregar usuario** (correo + contraseña). Esa persona ya puede entrar a la app y aparece en la lista del admin. El botón **Abrir Firebase** del panel Admin lleva directo ahí.
- **El registro público está desactivado** en Firebase (Authentication → Configuración → Acciones del usuario), así que nadie puede crear su propia cuenta.
- Cada persona puede cambiar su contraseña en **Ajustes → Cambiar contraseña**.
- El administrador está definido por su UID en `firestore.rules` y `firebase-config.js`.

## Ingreso y seguridad

- Cuenta con **correo y contraseña** (Firebase Authentication). El iPhone y el Mac ofrecen guardar la contraseña en el llavero y la rellenan con Face ID / Touch ID.
- **Bloqueo con Face ID / huella**: se activa en Ajustes en cada dispositivo. Al abrir la app pide el sensor; si estuvo cerrada más de 2 minutos lo vuelve a pedir.
- Los datos están en Firestore bajo `users/{tu-id}` y las reglas (`firestore.rules`) solo dejan leer y escribir a la persona dueña de la cuenta.

## Instalar en cada dispositivo

| Dispositivo | Cómo |
|---|---|
| iPhone / iPad | Safari → Compartir → **Agregar a inicio** |
| Mac (Safari) | **Archivo → Agregar al Dock** |
| Mac (Chrome) | Ícono de instalar en la barra de direcciones |

Después ingresa con tu correo y contraseña y, si quieres, activa el bloqueo en **Ajustes**.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura, pantallas de ingreso y bloqueo |
| `styles.css` | Diseño (claro y oscuro automático) |
| `app.js` | Lógica de la app, sincronización en vivo y Face ID |
| `firebase-config.js` | Conexión con el proyecto Firebase `mis-finanzas-58ed0` |
| `firestore.rules` | Reglas de seguridad de la base de datos (copia de las publicadas) |
| `sw.js` | Uso sin conexión y actualizaciones |
| `manifest.webmanifest`, `icon*` | Instalación como app |
