// nlayers.js - Librería de mapas basada en teselas de tamaño completo
(function(global) {
    'use strict';

    // Namespace principal
    const nl = {
        layer: {},
        source: {},
        Map: Mapa,
        Mapa: Mapa,
        View: View
    };

    // Clase para la vista del mapa
    function View(options = {}) {
        this.center = options.center || [0, 0]; // [col, row] en coordenadas de tesela
        this.zoom = options.zoom || 1;
        this.resolution = Math.pow(2, -this.zoom);
        return this;
    }

    // Fuente de datos para mapas de teselas
    function MapSource(options = {}) {
        this.img = options.img || '';
        this.division = options.division || [5, 5]; // [columnas, filas]
        this.tileSize = [800, 600]; // Tamaño de cada tesela igual al lienzo
        this.loaded = false;
        this.image = null;
        return this;
    }

    MapSource.prototype.load = function(callback) {
        if (this.loaded) {
            callback();
            return;
        }

        this.image = new Image();
        this.image.onload = () => {
            this.loaded = true;
            // Verificar que las dimensiones de la imagen sean correctas
            const [cols, rows] = this.division;
            const expectedWidth = cols * this.tileSize[0];
            const expectedHeight = rows * this.tileSize[1];
            
            if (this.image.width !== expectedWidth || this.image.height !== expectedHeight) {
                console.warn(`Las dimensiones de la imagen (${this.image.width}x${this.image.height}) no coinciden con las esperadas (${expectedWidth}x${expectedHeight})`);
            }
            callback();
        };
        this.image.onerror = () => {
            console.error('Error cargando imagen:', this.img);
        };
        this.image.src = this.img;
    };

    // Capa de teselas
    function TileLayer(options = {}) {
        this.source = options.source || null;
        this.opacity = options.opacity || 1;
        this.visible = options.visible !== undefined ? options.visible : true;
        return this;
    }

    // Clase principal del mapa
    function Mapa(options = {}) {
        this.target = options.target || '';
        this.layers = options.layers || [];
        this.view = options.view || new View();
        this.canvas = null;
        this.ctx = null;
        this.initialized = false;
        this.container = null;
        
        this.init();
        return this;
    }

    Mapa.prototype.init = function() {
        const targetElement = document.getElementById(this.target);
        if (!targetElement) {
            console.error('Elemento target no encontrado:', this.target);
            return;
        }

        this.container = targetElement;
        
        // Crear canvas con las dimensiones del contenedor
        this.canvas = document.createElement('canvas');
        this.updateCanvasSize();
        
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.border = '1px solid #ccc';
        this.canvas.style.backgroundColor = '#f0f0f0';
        
        // Limpiar el contenedor y agregar el canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        
        // Precargar imágenes y luego renderizar
        this.preloadImages(() => {
            this.initialized = true;
            this.render();
            this.addEvents();
        });

        // Manejar redimensionamiento
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
            this.render();
        });
    };

    Mapa.prototype.updateCanvasSize = function() {
        if (this.container && this.canvas) {
            this.canvas.width = this.container.offsetWidth;
            this.canvas.height = this.container.offsetHeight;
        }
    };

    Mapa.prototype.preloadImages = function(callback) {
        let loadedCount = 0;
        const totalLayers = this.layers.length;

        if (totalLayers === 0) {
            callback();
            return;
        }

        this.layers.forEach(layer => {
            if (layer.source && !layer.source.loaded) {
                layer.source.load(() => {
                    loadedCount++;
                    if (loadedCount === totalLayers) {
                        callback();
                    }
                });
            } else {
                loadedCount++;
                if (loadedCount === totalLayers) {
                    callback();
                }
            }
        });
    };

    Mapa.prototype.render = function() {
        if (!this.initialized) return;

        // Limpiar canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Renderizar cada capa
        this.layers.forEach(layer => {
            if (layer.visible && layer.source && layer.source.loaded) {
                this.renderLayer(layer);
            }
        });
    };

    Mapa.prototype.renderLayer = function(layer) {
        const source = layer.source;
        const view = this.view;
        const canvas = this.canvas;
        const ctx = this.ctx;

        const [totalCols, totalRows] = source.division;
        const [tileWidth, tileHeight] = source.tileSize;

        // Calcular la tesela actual basada en el centro
        const currentCol = Math.floor(view.center[0]);
        const currentRow = Math.floor(view.center[1]);

        // Verificar que las coordenadas estén dentro del rango
        if (currentCol >= 0 && currentCol < totalCols && currentRow >= 0 && currentRow < totalRows) {
            // Aplicar opacidad
            ctx.globalAlpha = layer.opacity;

            // Dibujar la tesela actual centrada
            this.drawCurrentTile(layer, currentCol, currentRow);

            // Restaurar opacidad
            ctx.globalAlpha = 1.0;

            // Dibujar información de debug
            this.drawDebugInfo(currentCol, currentRow, totalCols, totalRows);
        } else {
            // Fuera de los límites - dibujar fondo de error
            ctx.fillStyle = '#ffcccc';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Fuera de los límites del mapa', canvas.width / 2, canvas.height / 2);
        }
    };

    Mapa.prototype.drawCurrentTile = function(layer, col, row) {
        const source = layer.source;
        const canvas = this.canvas;
        const ctx = this.ctx;

        const [tileWidth, tileHeight] = source.tileSize;

        // Coordenadas de recorte en la imagen fuente
        const sourceX = col * tileWidth;
        const sourceY = row * tileHeight;

        // Calcular escala para ajustar al canvas
        const scaleX = canvas.width / tileWidth;
        const scaleY = canvas.height / tileHeight;
        const scale = Math.min(scaleX, scaleY);

        // Calcular posición centrada
        const drawWidth = tileWidth * scale;
        const drawHeight = tileHeight * scale;
        const drawX = (canvas.width - drawWidth) / 2;
        const drawY = (canvas.height - drawHeight) / 2;

        // Dibujar tesela escalada y centrada
        ctx.drawImage(
            source.image,
            sourceX, sourceY, tileWidth, tileHeight, // Recorte de la fuente
            drawX, drawY, drawWidth, drawHeight // Dibujo en canvas
        );

        // Dibujar borde de la tesela
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
    };

    Mapa.prototype.drawDebugInfo = function(col, row, totalCols, totalRows) {
        const canvas = this.canvas;
        const ctx = this.ctx;

        // Información de coordenadas
        ctx.fillStyle = 'blue';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Tesela: [${col}, ${row}]`, 10, 25);
        ctx.fillText(`Zoom: ${this.view.zoom.toFixed(1)}`, 10, 50);
        ctx.fillText(`Centro: [${this.view.center[0].toFixed(2)}, ${this.view.center[1].toFixed(2)}]`, 10, 75);
        ctx.fillText(`Límites: 0,0 a ${totalCols-1},${totalRows-1}`, 10, 100);

        // Instrucciones
        ctx.fillStyle = 'green';
        ctx.textAlign = 'right';
        ctx.fillText('Usa las flechas para navegar', canvas.width - 10, 25);
        ctx.fillText('+/- para zoom', canvas.width - 10, 50);
    };

    Mapa.prototype.addEvents = function() {
        // Navegación con teclado
        document.addEventListener('keydown', (e) => {
            const [totalCols, totalRows] = this.layers[0].source.division;
            
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.view.center[0] = Math.max(0, this.view.center[0] - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.view.center[0] = Math.min(totalCols - 1, this.view.center[0] + 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.view.center[1] = Math.max(0, this.view.center[1] - 1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.view.center[1] = Math.min(totalRows - 1, this.view.center[1] + 1);
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    this.view.zoom = Math.min(5, this.view.zoom + 0.5);
                    this.view.resolution = Math.pow(2, -this.view.zoom);
                    break;
                case '-':
                    e.preventDefault();
                    this.view.zoom = Math.max(0.5, this.view.zoom - 0.5);
                    this.view.resolution = Math.pow(2, -this.view.zoom);
                    break;
                default:
                    return;
            }
            
            this.render();
        });

        // Navegación con clic (opcional)
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Navegación simple: click izquierdo/medio/derecho
            const [totalCols, totalRows] = this.layers[0].source.division;
            
            if (x < this.canvas.width / 3) {
                // Click en tercio izquierdo - mover izquierda
                this.view.center[0] = Math.max(0, this.view.center[0] - 1);
            } else if (x > 2 * this.canvas.width / 3) {
                // Click en tercio derecho - mover derecha
                this.view.center[0] = Math.min(totalCols - 1, this.view.center[0] + 1);
            } else if (y < this.canvas.height / 3) {
                // Click en tercio superior - mover arriba
                this.view.center[1] = Math.max(0, this.view.center[1] - 1);
            } else if (y > 2 * this.canvas.height / 3) {
                // Click en tercio inferior - mover abajo
                this.view.center[1] = Math.min(totalRows - 1, this.view.center[1] + 1);
            }
            
            this.render();
        });

        // Efecto hover en bordes
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (x < 50) {
                this.canvas.style.cursor = 'w-resize';
            } else if (x > this.canvas.width - 50) {
                this.canvas.style.cursor = 'e-resize';
            } else if (y < 50) {
                this.canvas.style.cursor = 'n-resize';
            } else if (y > this.canvas.height - 50) {
                this.canvas.style.cursor = 's-resize';
            } else {
                this.canvas.style.cursor = 'default';
            }
        });
    };

    // Métodos públicos
    Mapa.prototype.setView = function(view) {
        this.view = view;
        this.render();
    };

    Mapa.prototype.addLayer = function(layer) {
        this.layers.push(layer);
        if (this.initialized) {
            this.preloadImages(() => this.render());
        }
    };

    Mapa.prototype.removeLayer = function(layer) {
        const index = this.layers.indexOf(layer);
        if (index > -1) {
            this.layers.splice(index, 1);
            this.render();
        }
    };

    Mapa.prototype.getCenter = function() {
        return [...this.view.center];
    };

    Mapa.prototype.setCenter = function(col, row) {
        this.view.center = [col, row];
        this.render();
    };

    // Factory methods para el namespace
    nl.layer.Tile = function(options) {
        return new TileLayer(options);
    };

    nl.source.Map = function(options) {
        return new MapSource(options);
    };

    nl.View = function(options) {
        return new View(options);
    };

    // Exponer al ámbito global
    global.nl = nl;

})(window);