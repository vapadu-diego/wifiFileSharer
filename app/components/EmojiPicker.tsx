"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export interface EmojiItem {
  char: string;
  tags: string[];
}

export interface EmojiGroup {
  id: string;
  label: string;
  emojis: EmojiItem[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "caras",
    label: "Caras",
    emojis: [
      { char: "😀", tags: ["cara", "sonrisa", "feliz", "happy"] },
      { char: "😃", tags: ["cara", "sonrisa", "feliz"] },
      { char: "😄", tags: ["cara", "sonrisa", "feliz"] },
      { char: "😁", tags: ["cara", "grin", "sonrisa"] },
      { char: "😆", tags: ["cara", "risa", "jajaja"] },
      { char: "😅", tags: ["cara", "sudor", "risa"] },
      { char: "😂", tags: ["cara", "risa", "lol", "jajaja"] },
      { char: "🤣", tags: ["cara", "risa", "lol", "rodando"] },
      { char: "😊", tags: ["cara", "sonrisa", "feliz", "bonito"] },
      { char: "😇", tags: ["cara", "angel", "santo"] },
      { char: "🙂", tags: ["cara", "sonrisa"] },
      { char: "🙃", tags: ["cara", "boca", "abajo"] },
      { char: "😉", tags: ["cara", "guino", "guiño"] },
      { char: "😌", tags: ["cara", "relajado", "aliviado"] },
      { char: "😍", tags: ["cara", "amor", "corazon", "ojos"] },
      { char: "🥰", tags: ["cara", "amor", "corazon", "cariño"] },
      { char: "😘", tags: ["beso", "amor", "besito"] },
      { char: "😗", tags: ["beso", "cara", "besito"] },
      { char: "😙", tags: ["beso", "cara"] },
      { char: "😚", tags: ["beso", "cara"] },
      { char: "😋", tags: ["cara", "rico", "comer", "guau"] },
      { char: "😛", tags: ["cara", "lengua", "tonteria"] },
      { char: "😝", tags: ["cara", "lengua", "burlon"] },
      { char: "😜", tags: ["cara", "guino", "lengua", "loco"] },
      { char: "🤪", tags: ["cara", "loco", "loca"] },
      { char: "🤨", tags: ["cara", "duda", "ceja", "serio"] },
      { char: "🧐", tags: ["cara", "cerebro", "monocle", "lupa"] },
      { char: "🤓", tags: ["cara", "nerd", "lentes"] },
      { char: "😎", tags: ["cara", "lentes", "cool"] },
      { char: "🥸", tags: ["cara", "disimulo", "lentes", "falso"] },
      { char: "🤩", tags: ["cara", "estrella", "asombrado"] },
      { char: "🥳", tags: ["cara", "fiesta", "cumpleanos"] },
      { char: "😏", tags: ["cara", "guino", "picaro", "sarcasmo"] },
      { char: "😒", tags: ["cara", "aburrido", "molesto"] },
      { char: "😞", tags: ["cara", "triste", "decepcionado"] },
      { char: "😔", tags: ["cara", "triste", "pensativo"] },
      { char: "😟", tags: ["cara", "preocupado", "triste"] },
      { char: "😕", tags: ["cara", "confundido"] },
      { char: "🙁", tags: ["cara", "triste"] },
      { char: "😣", tags: ["cara", "dolor", "triste"] },
      { char: "😖", tags: ["cara", "frustrado"] },
      { char: "😫", tags: ["cara", "cansado"] },
      { char: "😩", tags: ["cara", "cansado", "llorar"] },
      { char: "🥺", tags: ["cara", "ojitos", "piedad", "triste", "suplica"] },
      { char: "😢", tags: ["cara", "llorar", "triste"] },
      { char: "😭", tags: ["cara", "llorar", "llanto"] },
      { char: "😤", tags: ["cara", "enojo", "vapor"] },
      { char: "😠", tags: ["cara", "enojo", "molesto"] },
      { char: "😡", tags: ["cara", "enojo", "rojo", "furioso"] },
      { char: "🤬", tags: ["cara", "enojo", "groseria"] },
      { char: "🤯", tags: ["cara", "explotar", "cabeza", "sorprendido"] },
      { char: "😳", tags: ["cara", "sorprendido", "rojo", "avergonzado"] },
      { char: "🥵", tags: ["cara", "calor", "rojo"] },
      { char: "🥶", tags: ["cara", "frio", "hielo"] },
      { char: "😱", tags: ["cara", "grito", "susto", "terror"] },
      { char: "😨", tags: ["cara", "miedo", "susto"] },
      { char: "😰", tags: ["cara", "sudor", "ansiedad"] },
      { char: "😥", tags: ["cara", "sudor", "alivio"] },
      { char: "😓", tags: ["cara", "sudor", "estres"] },
      { char: "🤗", tags: ["cara", "abrazo"] },
      { char: "🤔", tags: ["cara", "pensar", "duda", "pensando"] },
      { char: "🤭", tags: ["cara", "boca", "mano", "jaja"] },
      { char: "🤫", tags: ["cara", "silencio", "shh"] },
      { char: "🤥", tags: ["cara", "mentira", "pinocho"] },
      { char: "😶", tags: ["cara", "sin boca"] },
      { char: "😐", tags: ["cara", "neutro"] },
      { char: "😑", tags: ["cara", "neutro", "serio"] },
      { char: "😬", tags: ["cara", "mueca", "incómodo", "dientes"] },
      { char: "🙄", tags: ["cara", "ojos", "roll", "aburrido"] },
      { char: "😯", tags: ["cara", "sorprendido", "shock"] },
      { char: "😮", tags: ["cara", "guau", "sorprendido"] },
      { char: "😲", tags: ["cara", "asombro", "guau"] },
      { char: "🥱", tags: ["cara", "bostezo", "sueño", "aburrido"] },
      { char: "😴", tags: ["cara", "dormir", "sueño"] },
      { char: "🤤", tags: ["cara", "baba", "deseo", "rico"] },
      { char: "😪", tags: ["cara", "dormir", "dormido"] },
      { char: "😵", tags: ["cara", "mareado", "mareado"] },
      { char: "🤐", tags: ["cara", "callado", "cremallera"] },
      { char: "🥴", tags: ["cara", "mareado", "tonto"] },
      { char: "🤢", tags: ["cara", "nausea", "vomitar", "mal"] },
      { char: "🤮", tags: ["cara", "vomitar", "nausea"] },
      { char: "🤧", tags: ["cara", "estornudo", "gripe"] },
      { char: "😷", tags: ["cara", "mascarilla", "enfermo"] },
      { char: "🤒", tags: ["cara", "termometro", "fiebre", "enfermo"] },
      { char: "🤕", tags: ["cara", "vendaje", "herido"] },
      { char: "🤑", tags: ["cara", "dinero", "dolar", "rico"] },
      { char: "🤠", tags: ["cara", "vaquero"] },
      { char: "😈", tags: ["diablo", "malo", "travieso"] },
      { char: "👿", tags: ["diablo", "angry"] },
      { char: "🤡", tags: ["cara", "payaso"] },
      { char: "💩", tags: ["caca", "poop", "pumba"] },
      { char: "👻", tags: ["fantasma", "halloween"] },
      { char: "💀", tags: ["calavera", "muerte"] },
      { char: "👽", tags: ["alien"], },
      { char: "🤖", tags: ["robot", "monstruo"] },
      { char: "😺", tags: ["gato", "cara", "sonrisa"] },
      { char: "😻", tags: ["gato", "amor", "ojos"] },
      { char: "🙀", tags: ["gato", "susto"] },
      { char: "😾", tags: ["gato", "enojo"] },
    ],
  },
  {
    id: "gestos",
    label: "Gestos",
    emojis: [
      { char: "👋", tags: ["ola", "saludo", "hola", "adios"] },
      { char: "🤚", tags: ["mano", "alto"] },
      { char: "✋", tags: ["mano", "alto", "cinco"] },
      { char: "🖖", tags: ["mano", "vulcano"] },
      { char: "👌", tags: ["ok", "perfecto", "mano"] },
      { char: "🤏", tags: ["poquito", "pequeño", "mano"] },
      { char: "✌️", tags: ["paz", "victoria", "dedos"] },
      { char: "🤞", tags: ["dedos", "cruzados", "buena suerte"] },
      { char: "🤟", tags: ["te quiero", "rock", "dedo"] },
      { char: "🤘", tags: ["rock", "metal"] },
      { char: "🤙", tags: ["llamame", "surf", "shaka"] },
      { char: "👈", tags: ["señalar", "izquierda"] },
      { char: "👉", tags: ["señalar", "derecha"] },
      { char: "👆", tags: ["señalar", "arriba"] },
      { char: "👇", tags: ["señalar", "abajo"] },
      { char: "☝️", tags: ["señalar", "arriba", "index"] },
      { char: "👍", tags: ["like", "pulgar", "arriba", "bien"] },
      { char: "👎", tags: ["dislike", "pulgar", "abajo"] },
      { char: "✊", tags: ["puno", "fuerza"] },
      { char: "👊", tags: ["puno", "golpe", "chocar"] },
      { char: "🤛", tags: ["protesta", "puno"] },
      { char: "🤜", tags: ["protesta", "puno"] },
      { char: "👏", tags: ["aplauso", "felicidades", "clap"] },
      { char: "🙌", tags: ["celebrar", "fiesta", "manos"] },
      { char: "👐", tags: ["abierto", "manos"] },
      { char: "🤲", tags: ["palmas", "dar"] },
      { char: "🤝", tags: ["apretón", "acuerdo", "saludo"] },
      { char: "🙏", tags: ["gracias", "por favor", "reza"] },
      { char: "✍️", tags: ["escribir", "pluma"] },
      { char: "💅", tags: ["uñas", "mani", "pintar"] },
      { char: "🤳", tags: ["selfie", "foto"] },
      { char: "💪", tags: ["fuerza", "musculo", "gym"] },
      { char: "🦾", tags: ["brazo", "robot", "fuerza"] },
      { char: "🦵", tags: ["pierna", "patada"] },
      { char: "🦶", tags: ["pie", "pata"] },
      { char: "👂", tags: ["oreja", "escuchar"] },
      { char: "👃", tags: ["nariz", "oler"] },
      { char: "🧠", tags: ["cerebro", "mente"] },
      { char: "🦷", tags: ["diente", "muela"] },
      { char: "👀", tags: ["ojos", "mirar"] },
      { char: "👁️", tags: ["ojo", "mirar"] },
      { char: "👅", tags: ["lengua", "yo"] },
      { char: "👄", tags: ["labios", "boca"] },
      { char: "🫦", tags: ["labios", "boca"] },
    ],
  },
  {
    id: "animales",
    label: "Animales",
    emojis: [
      { char: "🐶", tags: ["perro", "cachorro"] },
      { char: "🐱", tags: ["gato", "michi"] },
      { char: "🐭", tags: ["raton"] },
      { char: "🐹", tags: ["hamster"] },
      { char: "🐰", tags: ["conejo"] },
      { char: "🦊", tags: ["zorro"] },
      { char: "🐻", tags: ["oso"] },
      { char: "🐼", tags: ["panda"] },
      { char: "🐨", tags: ["koala"] },
      { char: "🐯", tags: ["tigre"] },
      { char: "🦁", tags: ["leon"] },
      { char: "🐮", tags: ["vaca"] },
      { char: "🐷", tags: ["cerdo", "chancho"] },
      { char: "🐸", tags: ["rana"] },
      { char: "🐵", tags: ["mono"] },
      { char: "🙈", tags: ["mono", "ver", "ojos"] },
      { char: "🙉", tags: ["mono", "oidos"] },
      { char: "🙊", tags: ["mono", "callado"] },
      { char: "🐔", tags: ["pollo", "gallina"] },
      { char: "🐧", tags: ["pinguino"] },
      { char: "🐦", tags: ["pajaro"] },
      { char: "🐤", tags: ["pollo", "bebe"] },
      { char: "🦆", tags: ["pato"] },
      { char: "🦅", tags: ["aguila"] },
      { char: "🦉", tags: ["buho"] },
      { char: "🦇", tags: ["murcielago"] },
      { char: "🐺", tags: ["lobo"] },
      { char: "🐗", tags: ["jabali"] },
      { char: "🐴", tags: ["caballo"] },
      { char: "🦄", tags: ["unicornio"] },
      { char: "🐝", tags: ["abeja"] },
      { char: "🐛", tags: ["oruga", "gusano"] },
      { char: "🦋", tags: ["mariposa"] },
      { char: "🐌", tags: ["caracol"] },
      { char: "🐞", tags: ["catarina", "mariquita"] },
      { char: "🐜", tags: ["hormiga"] },
      { char: "🐢", tags: ["tortuga"] },
      { char: "🐍", tags: ["serpiente", "culebra"] },
      { char: "🦎", tags: ["lagarto", "iguana"] },
      { char: "🐙", tags: ["pulpo"] },
      { char: "🦑", tags: ["calamar"] },
      { char: "🦀", tags: ["cangrejo"] },
      { char: "🐡", tags: ["pez", "pececito"] },
      { char: "🐠", tags: ["pez", "tropical"] },
      { char: "🐟", tags: ["pez"] },
      { char: "🐬", tags: ["delfin"] },
      { char: "🐳", tags: ["ballena"] },
      { char: "🐋", tags: ["ballena", "grande"] },
      { char: "🦈", tags: ["tiburon"] },
      { char: "🦖", tags: ["dinosaurio", "trex"] },
      { char: "🌵", tags: ["cactus"] },
      { char: "🌲", tags: ["arbol", "pino"] },
      { char: "🌳", tags: ["arbol"] },
      { char: "🌴", tags: ["palmera", "playa"] },
      { char: "🌿", tags: ["hoja", "verde"] },
      { char: "🍀", tags: ["trébol", "suerte", "cuatro"] },
      { char: "🍁", tags: ["hoja", "otoño", "acero"] },
      { char: "🍂", tags: ["hoja", "otoño"] },
      { char: "🌹", tags: ["rosa", "flor"] },
      { char: "🌸", tags: ["flor", "cerezo", "sakura"] },
      { char: "🌻", tags: ["girasol", "flor"] },
      { char: "🌼", tags: ["flor"] },
      { char: "🌷", tags: ["tulipan", "flor"] },
      { char: "🌈", tags: ["arcoiris", "arco"] },
      { char: "☀️", tags: ["sol", "dia", "calor"] },
      { char: "🌙", tags: ["luna", "noche"] },
      { char: "⭐", tags: ["estrella"] },
      { char: "🌟", tags: ["estrella", "brillo"] },
      { char: "✨", tags: ["brillo", "brillar", "estrella"] },
      { char: "⚡", tags: ["rayo", "electricidad"] },
      { char: "🔥", tags: ["fuego", "fire"] },
      { char: "💧", tags: ["agua", "gota"] },
      { char: "🌊", tags: ["ola", "mar", "agua"] },
    ],
  },
  {
    id: "comida",
    label: "Comida",
    emojis: [
      { char: "🍎", tags: ["manzana", "fruta"] },
      { char: "🍌", tags: ["banano", "platano", "fruta"] },
      { char: "🍉", tags: ["sandia", "fruta"] },
      { char: "🍇", tags: ["uvas", "fruta"] },
      { char: "🍓", tags: ["fresa", "fruta"] },
      { char: "🍑", tags: ["durazno", "fruta"] },
      { char: "🍍", tags: ["piña", "fruta"] },
      { char: "🥭", tags: ["mango", "fruta"] },
      { char: "🍒", tags: ["cerezas", "fruta"] },
      { char: "🍋", tags: ["limon", "fruta"] },
      { char: "🍊", tags: ["naranja", "fruta"] },
      { char: "🥑", tags: ["aguacate", "palta"] },
      { char: "🍅", tags: ["tomate", "jitomate"] },
      { char: "🥕", tags: ["zanahoria"] },
      { char: "🌽", tags: ["maiz", "choclo"] },
      { char: "🥔", tags: ["papa", "patata"] },
      { char: "🥦", tags: ["brocoli"] },
      { char: "🍞", tags: ["pan"] },
      { char: "🧀", tags: ["queso"] },
      { char: "🥓", tags: ["tocino", "bacon"] },
      { char: "🍳", tags: ["huevo", "sarten", "cocina"] },
      { char: "🍔", tags: ["hamburguesa"] },
      { char: "🍟", tags: ["papas", "fritas", "papa"] },
      { char: "🌭", tags: ["hotdog", "perro caliente"] },
      { char: "🍕", tags: ["pizza"] },
      { char: "🌮", tags: ["taco", "tacos"] },
      { char: "🌯", tags: ["burrito"] },
      { char: "🥗", tags: ["ensalada"] },
      { char: "🍝", tags: ["pasta", "espagueti"] },
      { char: "🍜", tags: ["ramen", "sopa"] },
      { char: "🍰", tags: ["pastel", "torta", "postre"] },
      { char: "🎂", tags: ["pastel", "cumpleanos", "torta"] },
      { char: "🍩", tags: ["dona", "rosquilla"] },
      { char: "🍪", tags: ["galleta"] },
      { char: "🍫", tags: ["chocolate"] },
      { char: "🍬", tags: ["dulce", "caramelo"] },
      { char: "🍭", tags: ["chupete", "paleta"] },
      { char: "🧁", tags: ["cupcake", "pastel"] },
      { char: "🥤", tags: ["refresco", "gaseosa", "bebe"] },
      { char: "☕", tags: ["cafe", "café", "te"] },
      { char: "🍵", tags: ["te", "té", "verde"] },
      { char: "🍺", tags: ["cerveza", "chela"] },
      { char: "🍷", tags: ["vino"] },
      { char: "🥂", tags: ["brindis", "champagne", "brinda"] },
      { char: "🍸", tags: ["trago", "coctel", "cóctel"] },
      { char: "🍹", tags: ["trago", "coctel", "tropical", "cóctel"] },
      { char: "🥃", tags: ["whisky", "trago"] },
    ],
  },
  {
    id: "viajes",
    label: "Viajes",
    emojis: [
      { char: "✈️", tags: ["avion", "avión", "vuelo"] },
      { char: "🚀", tags: ["cohete", "espacio"] },
      { char: "🚗", tags: ["auto", "carro", "coche"] },
      { char: "🚕", tags: ["taxi"] },
      { char: "🚙", tags: ["auto", "jeep", "SUV"] },
      { char: "🏎️", tags: ["auto", "carrera", "F1"] },
      { char: "🏍️", tags: ["moto", "motorcycle"] },
      { char: "🚲", tags: ["bicicleta", "bici"] },
      { char: "🛺", tags: ["tuctuc", "moto taxi"] },
      { char: "🛵", tags: ["moto", "scooter"] },
      { char: "🚂", tags: ["tren", "locomotora"] },
      { char: "🚆", tags: ["tren"] },
      { char: "🚇", tags: ["metro"] },
      { char: "🚌", tags: ["bus", "camion"] },
      { char: "🚐", tags: ["camioneta", "Van"] },
      { char: "🚑", tags: ["ambulancia"] },
      { char: "🚒", tags: ["bomberos", "camion"] },
      { char: "🚓", tags: ["policia", "patrulla", "policía"] },
      { char: "🚔", tags: ["policia", "policía"] },
      { char: "🚖", tags: ["taxi", "cab"] },
      { char: "🚢", tags: ["barco", "crucero"] },
      { char: "⛴️", tags: ["ferry", "barco"] },
      { char: "🚤", tags: ["lancha", "veloz"] },
      { char: "⛵", tags: ["velero", "barco", "vela"] },
      { char: "🛶", tags: ["canoa", "piragua"] },
      { char: "🚁", tags: ["helicoptero", "helicóptero"] },
      { char: "🛬", tags: ["avion", "aterrizar", "avión"] },
      { char: "🛫", tags: ["avion", "despegue", "avión"] },
      { char: "🗺️", tags: ["mapa"] },
      { char: "🏠", tags: ["casa"] },
      { char: "🏡", tags: ["casa", "jardin", "jardín"] },
      { char: "🏢", tags: ["edificio", "oficina"] },
      { char: "🏤", tags: ["edificio", "oficina"] },
      { char: "🏰", tags: ["castillo"] },
      { char: "🌍", tags: ["mundo", "tierra", "globo"] },
      { char: "🌎", tags: ["mundo", "tierra", "america", "américa"] },
      { char: "🌏", tags: ["mundo", "tierra", "asia"] },
      { char: "🗼", tags: ["torre", "eiffel"] },
      { char: "🗽", tags: ["libertad", "estatua", "NY"] },
      { char: "🏖️", tags: ["playa", "arena"] },
      { char: "🌋", tags: ["volcan", "volcán"] },
      { char: "🗻", tags: ["montaña", "fuji"] },
      { char: "⛰️", tags: ["montaña"] },
      { char: "🏔️", tags: ["montaña", "nieve"] },
      { char: "🌅", tags: ["amanecer", "sol"] },
      { char: "🌇", tags: ["atardecer", "sol"] },
      { char: "🌉", tags: ["puente", "noche"] },
    ],
  },
  {
    id: "actividades",
    label: "Actividades",
    emojis: [
      { char: "⚽", tags: ["futbol", "fútbol", "pelota"] },
      { char: "🏀", tags: ["basquet", "pelota", "basquetbol"] },
      { char: "🏈", tags: ["americano", "futbol", "fútbol"] },
      { char: "⚾", tags: ["beisbol", "béisbol", "pelota"] },
      { char: "🥎", tags: ["softball", "pelota"] },
      { char: "🎾", tags: ["tenis", "pelota"] },
      { char: "🏐", tags: ["volley", "vóley", "pelota"] },
      { char: "🏉", tags: ["rugby", "pelota"] },
      { char: "🎱", tags: ["pool", "billar", "bola 8"] },
      { char: "🏓", tags: ["ping pong", "paletas", "pong"] },
      { char: "🏸", tags: ["badminton", "bádminton"] },
      { char: "🥊", tags: ["box", "boxeo", "guante"] },
      { char: "🥋", tags: ["karate", "judo", "kimono"] },
      { char: "🥅", tags: ["arco", "portería", "gol"] },
      { char: "⛳", tags: ["golf", "bandera"] },
      { char: "🏂", tags: ["snow", "nieve", "snowboard"] },
      { char: "🏄", tags: ["surf", "ola"] },
      { char: "🚣", tags: ["remo", "bote"] },
      { char: "🏊", tags: ["nadar", "natacion", "natación"] },
      { char: "🚴", tags: ["ciclismo", "bicicleta"] },
      { char: "🚵", tags: ["montaña", "bicicleta"] },
      { char: "🏋️", tags: ["pesas", "gym", "levantar"] },
      { char: "🧘", tags: ["yoga", "meditacion", "meditación"] },
      { char: "🤸", tags: ["flexion", "flexión", "gimnasia"] },
      { char: "🎮", tags: ["videojuego", "juego", "gamer"] },
      { char: "🕹️", tags: ["arcade", "joystick", "videojuego"] },
      { char: "🎲", tags: ["dado", "azar", "poker"] },
      { char: "🧩", tags: ["puzzle", "rompecabezas", "pieza"] },
      { char: "🎯", tags: ["diana", "blanco", "punto"] },
      { char: "🎳", tags: ["bolos", "bowling"] },
      { char: "🎤", tags: ["microfono", "micrófono", "kpop"] },
      { char: "🎧", tags: ["audifonos", "audífonos", "musica", "música"] },
      { char: "🎸", tags: ["guitarra"] },
      { char: "🎹", tags: ["piano"] },
      { char: "🎷", tags: ["saxofon", "saxofón"] },
      { char: "🎻", tags: ["violin", "violín"] },
      { char: "🥁", tags: ["bateria", "batería", "tambor"] },
      { char: "🎬", tags: ["cine", "pelicula", "película", "claqueta"] },
      { char: "🎨", tags: ["arte", "pintar", "paleta"] },
      { char: "🎭", tags: ["teatro", "mascara", "máscara"] },
      { char: "🎪", tags: ["circo", "carpas"] },
      { char: "🎟️", tags: ["boletos", "tickets"] },
      { char: "🎖️", tags: ["medalla", "militar"] },
      { char: "🏆", tags: ["trofeo", "campeon", "campeón"] },
      { char: "🥇", tags: ["oro", "medalla", "primero"] },
      { char: "🥈", tags: ["plata", "medalla", "segundo"] },
      { char: "🥉", tags: ["bronce", "medalla", "tercero"] },
    ],
  },
  {
    id: "objetos",
    label: "Objetos",
    emojis: [
      { char: "💡", tags: ["idea", "foco", "bombilla", "luz"] },
      { char: "🔦", tags: ["linterna"] },
      { char: "📱", tags: ["celular", "telefono", "teléfono", "movil", "móvil"] },
      { char: "📲", tags: ["celular", "telefono", "teléfono", "mensaje"] },
      { char: "💻", tags: ["computadora", "laptop", "computador", "notebook"] },
      { char: "🖥️", tags: ["computadora", "escritorio", "monitor"] },
      { char: "⌨️", tags: ["teclado"] },
      { char: "🖱️", tags: ["raton", "ratón", "mouse"] },
      { char: "🖨️", tags: ["impresora"] },
      { char: "📷", tags: ["camara", "cámara", "foto", "fotografia", "fotografía"] },
      { char: "🎥", tags: ["camara", "cámara", "video", "video", "vídeo"] },
      { char: "📽️", tags: ["proyector", "video", "vídeo"] },
      { char: "📺", tags: ["tv", "television", "televisión"] },
      { char: "📻", tags: ["radio"] },
      { char: "⏰", tags: ["alarma", "reloj", "despertador"] },
      { char: "⏱️", tags: ["cronometro", "cronómetro", "reloj"] },
      { char: "⌚", tags: ["reloj", "pulsera", "smartwatch"] },
      { char: "🎁", tags: ["regalo", "presente", "sorpresa"] },
      { char: "🎈", tags: ["globo", "fiesta"] },
      { char: "🎉", tags: ["fiesta", "celebracion", "celebración", "confeti"] },
      { char: "🎊", tags: ["confeti", "fiesta"] },
      { char: "🎋", tags: ["tanabata", "arbolito", "árbolito"] },
      { char: "🎀", tags: ["lazo", "moño"] },
      { char: "🔑", tags: ["llave", "clave"] },
      { char: "🔒", tags: ["candado", "cerrado", "seguridad"] },
      { char: "🔓", tags: ["candado", "abierto"] },
      { char: "🔍", tags: ["lupa", "buscar", "busqueda", "búsqueda"] },
      { char: "🔎", tags: ["lupa", "buscar", "inclinada"] },
      { char: "🛠️", tags: ["herramientas", "martillo", "trabajo"] },
      { char: "⚙️", tags: ["ajuste", "ajustes", "engranaje"] },
      { char: "🧰", tags: ["caja de herramientas", "tareas"] },
      { char: "🧲", tags: ["iman", "imán"] },
      { char: "💊", tags: ["pastilla", "medicina", "pildora", "píldora"] },
      { char: "💉", tags: ["vacuna", "inyecta", "jeringa"] },
      { char: "🩺", tags: ["medico", "médico", "estetoscopio"] },
      { char: "💤", tags: ["dormir", "sueño", "dormido"] },
      { char: "✏️", tags: ["lapiz", "lápiz", "escribir"] },
      { char: "📝", tags: ["notas", "escribir", "libreta"] },
      { char: "📚", tags: ["libros", "estudiar", "biblioteca"] },
      { char: "📖", tags: ["libro", "leer", "abierto"] },
      { char: "📅", tags: ["calendario", "fecha"] },
      { char: "📆", tags: ["calendario", "fecha"] },
      { char: "📈", tags: ["grafico", "gráfico", "subir", "crecimiento"] },
      { char: "📉", tags: ["grafico", "gráfico", "bajar"] },
      { char: "📊", tags: ["grafico", "gráfico", "barras"] },
      { char: "💰", tags: ["dinero", "plata", "efectivo", "bolsa"] },
      { char: "💵", tags: ["dinero", "dolar", "dólar", "billete"] },
      { char: "💳", tags: ["tarjeta", "credito", "crédito", "debito", "débito"] },
      { char: "🧾", tags: ["recibo", "ticket"] },
    ],
  },
  {
    id: "simbolos",
    label: "Símbolos",
    emojis: [
      { char: "❤️", tags: ["corazon", "corazón", "amor"] },
      { char: "🧡", tags: ["corazon", "corazón", "naranja"] },
      { char: "💛", tags: ["corazon", "corazón", "amarillo"] },
      { char: "💚", tags: ["corazon", "corazón", "verde"] },
      { char: "💙", tags: ["corazon", "corazón", "azul"] },
      { char: "💜", tags: ["corazon", "corazón", "morado"] },
      { char: "🖤", tags: ["corazon", "corazón", "negro", "dark"] },
      { char: "🤍", tags: ["corazon", "corazón", "blanco"] },
      { char: "💔", tags: ["corazon", "corazón", "roto", "triste"] },
      { char: "❣️", tags: ["corazon", "corazón", "exclamacion", "exclamación"] },
      { char: "💕", tags: ["corazon", "corazón", "amor"] },
      { char: "💞", tags: ["corazon", "corazón"] },
      { char: "💓", tags: ["corazon", "corazón", "latido"] },
      { char: "💗", tags: ["corazon", "corazón", "roso"] },
      { char: "💖", tags: ["corazon", "corazón", "brillo"] },
      { char: "💘", tags: ["corazon", "corazón", "cupido", "flecha"] },
      { char: "💝", tags: ["corazon", "corazón", "regalo"] },
      { char: "💟", tags: ["corazon", "corazón", "decoracion", "decoración"] },
      { char: "🟥", tags: ["cuadrado", "rojo"] },
      { char: "🟧", tags: ["cuadrado", "naranja"] },
      { char: "🟨", tags: ["cuadrado", "amarillo"] },
      { char: "🟩", tags: ["cuadrado", "verde"] },
      { char: "🟦", tags: ["cuadrado", "azul"] },
      { char: "🟪", tags: ["cuadrado", "morado"] },
      { char: "⬛", tags: ["cuadrado", "negro"] },
      { char: "⬜", tags: ["cuadrado", "blanco"] },
      { char: "✅", tags: ["check", "verde", "ok", "hecho", "listo"] },
      { char: "❌", tags: ["equis", "x", "mal", "no", "error"] },
      { char: "❎", tags: ["x", "equis"] },
      { char: "⚠️", tags: ["aviso", "alerta", "peligro", "advertencia"] },
      { char: "🚫", tags: ["prohibido", "no", "bloqueado"] },
      { char: "♻️", tags: ["reciclar", "reciclaje"] },
      { char: "💯", tags: ["100", "puntos", "exacto", "cien"] },
      { char: "💥", tags: ["boom", "explosion", "explosión"] },
      { char: "❗", tags: ["exclamacion", "exclamación", "importante"] },
      { char: "❓", tags: ["pregunta", "duda", "interrogacion", "interrogación"] },
      { char: "💢", tags: ["enojo", "molestia", "veces"] },
      { char: "🆗", tags: ["ok", "bien"] },
      { char: "🆒", tags: ["cool", "frio", "frío"] },
      { char: "🆕", tags: ["nuevo"] },
      { char: "🎵", tags: ["musica", "música", "nota"] },
      { char: "🎶", tags: ["musica", "música", "notas"] },
      { char: "💬", tags: ["chat", "burbuja", "mensaje"] },
      { char: "🌐", tags: ["internet", "globo", "web"] },
      { char: "🔊", tags: ["volumen", "sonido", "alto"] },
      { char: "🔕", tags: ["silencio", "silenciar", "no sonido"] },
      { char: "📣", tags: ["anuncio", "megafono", "megáfono", "aviso"] },
    ],
  },
];

const RECENTS_KEY = "wifi_sharer_recent_emojis";
const MAX_RECENTS = 20;

export function getRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentEmoji(char: string): void {
  if (typeof window === "undefined") return;
  const current = getRecentEmojis().filter((c) => c !== char);
  current.unshift(char);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(current.slice(0, MAX_RECENTS)));
  } catch {
    // ignore storage errors
  }
}

/**
 * Inserts `insert` at the current caret position of `textarea` and restores focus/caret.
 */
export function insertAtCursor(
  textarea: HTMLTextAreaElement,
  value: string,
  setValue: (v: string) => void,
  insert: string
): void {
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insert + value.slice(end);
  setValue(next);
  const pos = start + insert.length;
  setTimeout(() => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(pos, pos);
  }, 0);
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(EMOJI_GROUPS[0].id);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>(() => getRecentEmojis());

  useEffect(() => {
    const handleOuterClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOuterClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOuterClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const normalizedQuery = normalizeText(query.trim());

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return null;
    const results: EmojiItem[] = [];
    const seen = new Set<string>();
    for (const group of EMOJI_GROUPS) {
      for (const emoji of group.emojis) {
        if (seen.has(emoji.char)) continue;
        const haystack = normalizeText(
          [emoji.char, emoji.tags.join(" "), group.label].join(" ")
        );
        if (haystack.includes(normalizedQuery)) {
          seen.add(emoji.char);
          results.push(emoji);
        }
      }
    }
    return results;
  }, [normalizedQuery]);

  const activeGroup = EMOJI_GROUPS.find((g) => g.id === activeTab) || EMOJI_GROUPS[0];

  const handlePick = (char: string) => {
    addRecentEmoji(char);
    setRecents(getRecentEmojis());
    onSelect(char);
  };

  const renderGrid = (emojis: EmojiItem[], keyPrefix: string) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: "2px",
        padding: "2px 6px 6px",
      }}
    >
      {emojis.map((item) => (
        <button
          key={keyPrefix + item.char}
          type="button"
          title={item.tags[0] || item.char}
          onClick={() => handlePick(item.char)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.05rem",
            lineHeight: 1,
            padding: "4px 0",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.1s",
          }}
          className="emoji-picker-item"
        >
          {item.char}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: "4px",
        width: "320px",
        maxWidth: "calc(100vw - 24px)",
        background: "rgba(18, 18, 26, 0.95)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 1px 0 rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 100,
        overflow: "hidden",
        maxHeight: "340px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header: category tabs + search */}
      <div style={{ borderBottom: "1px solid var(--card-border)", padding: "8px 8px 6px" }}>
        <div
          style={{
            display: "flex",
            gap: "4px",
            overflowX: "auto",
            marginBottom: "6px",
            paddingBottom: "2px",
          }}
          className="no-scrollbar"
        >
          {EMOJI_GROUPS.map((group) => {
            const isActive = activeTab === group.id && !normalizedQuery;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setActiveTab(group.id);
                  setQuery("");
                }}
                style={{
                  fontSize: "0.7rem",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? "rgba(0, 240, 255, 0.15)" : "rgba(255,255,255,0.05)",
                  color: isActive ? "var(--primary)" : "var(--muted)",
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {group.label}
              </button>
            );
          })}
        </div>
        <input
          className="input"
          style={{ height: "30px", minHeight: "30px", padding: "0 10px", fontSize: "0.8rem" }}
          placeholder="Buscar emojis…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {normalizedQuery ? (
          searchResults && searchResults.length > 0 ? (
            renderGrid(searchResults, "search-")
          ) : (
            <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--muted)" }}>
              Sin resultados
            </div>
          )
        ) : (
          <>
            {recents.length > 0 && (
              <div>
                <div
                  style={{
                    padding: "6px 12px 2px",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Recientes
                </div>
                {renderGrid(recents.map((c) => ({ char: c, tags: [c] })), "recent-")}
              </div>
            )}
            <div>
              <div
                style={{
                  padding: "6px 12px 2px",
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {activeGroup.label}
              </div>
              {renderGrid(activeGroup.emojis, activeGroup.id + "-")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
