# Tareas pendientes (KUE)

## UX / UI y navegación

- [x] **Cabecera móvil unificada al hacer scroll**: actualmente en móvil el nombre de un festival se coloca en la cabecera al hacer scroll; extender este comportamiento a todos los títulos de la app unificando el código en un componente/hook común.
- [ ] **Mejorar la votación postconcierto**: revisar y mejorar la experiencia/flujo de valoración tras los conciertos.

## Plataformas y reproducción

- [ ] **Más links a plataformas y personalización en ajustes**: añadir más enlaces a plataformas musicales/externas y permitir en los ajustes que los usuarios puedan reordenar, ocultar o mostrar cada plataforma.
- [ ] **Reproducción integrada en la app**: integrar alguna plataforma para poder escuchar música sin salir de la aplicación.

## Artistas y búsqueda

- [x] **Búsqueda de artistas y ficha de artista**: implementar un sistema de búsqueda de artistas con una ficha que muestre a qué festivales van o han ido, destacando de algún modo aquellos festivales que el usuario tiene añadidos en su app.

## Social, amigos y planificación conjunta

- [x] **Gestión de amigos**: añadir sistema para gestionar amistades entre usuarios.
- [x] **Visibilidad entre amigos**: permitir que los amigos vean los festivales añadidos y las valoraciones de los demás.
- [x] **Tabla comparativa y recomendación de festival**: cuando un usuario y uno o varios amigos coinciden en ir a un mismo festival, permitir crear una tabla comparativa con sus valoraciones y generar una recomendación automática del festival (recomendar ir si la media de valoraciones iguala o supera `3.2`).
  - [x] Backend (dominio, Prisma/migraciones, servicios, Server Actions y API REST)
  - [x] Interfaz de usuario (frontend)
- [x] **Agenda conjunta**: a partir de la comparativa/coincidencia en un festival con amigos, poder crear una agenda conjunta.
  - [x] Backend (dominio, Prisma/migraciones, servicios, Server Actions y API REST)
  - [x] Interfaz de usuario (frontend)
