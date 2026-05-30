# Documentación de Integración API Fútbol v2

Esta aplicación utiliza la API de **BZZOIRO** para obtener datos en tiempo real, estadísticas avanzadas y predicciones basadas en IA.

## Configuración y Origen de Datos

Los datos se extraen de la versión 2 (v2) de la API de Sports.

- **Endpoint Base Interno:** `https://sports.bzzoiro.com/api/v2`
- **Proxy del Servidor:** Todas las solicitudes se realizan a través de un proxy en `server.ts` bajo la ruta `/api/v2/*` para proteger la API Key.

## Autenticación

La autenticación se maneja mediante un `Token` en el header `Authorization`. La clave se configura en las variables de entorno como `BZZOIRO_API_KEY`.

## Endpoints Principales Utilizados

### 1. Predicciones (v2)
- **Ruta:** `api/v2/eventos/{eventId}/predicción/`
- **Descripción:** Devuelve probabilidades detalladas, marcador proyectado y recomendaciones tácticas.
- **Integración:** Consumido por el servicio `api.ts` en `getPredictionDetailed`.

### 2. Estadísticas en Vivo
- **Rutas:** 
  - `api/v2/events/{eventId}/stats/`
  - `api/v2/stats/?event_id={eventId}` (Fallback)
- **Descripción:** Proporciona datos de posesión, remates, xG (Goles Esperados) y ataques peligrosos.

### 3. Historial (H2H)
- **Ruta:** `api/v2/events/{eventId}/h2h/`
- **Descripción:** Recupera los últimos enfrentamientos entre ambos equipos.

### 4. Alineaciones
- **Ruta:** `api/v2/events/{eventId}/lineups/`
- **Descripción:** Información sobre jugadores titulares, suplentes y no disponibles.

## Procesamiento de Datos (Servicios)

La lógica de conexión reside principalmente en `/src/services/api.ts`.

- **`fetchSeguro`:** Utilidad central que maneja el cacheado (TTL de 60s), reintentos automáticos en caso de fallo 500 y normalización de respuestas.
- **Normalización IA:** Los textos de los modelos se procesan para eliminar redundancias y unificar el lenguaje.

## Recomendaciones para Desarrolladores

Cualquier nueva integración debe utilizar el componente `api.ts` y el método `fetchSeguro` para garantizar la estabilidad de la app y el uso eficiente de la cuota de la API.
