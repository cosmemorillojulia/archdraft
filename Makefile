.DEFAULT_GOAL := help

# En Windows pnpm es un .cmd que make 3.81 no sabe lanzar directamente.
ifeq ($(OS),Windows_NT)
PNPM := cmd /c pnpm
else
PNPM := pnpm
endif

WEB := @archdraft/web

.PHONY: help install run preview build test coverage watch lint format format-check typecheck check clean

help: ## Muestra esta ayuda
	@node -e "require('fs').readFileSync('Makefile','utf8').split('\n').forEach(l=>{const m=l.match(/^([a-z-]+):.*## (.*)/);if(m)console.log('  make '+m[1].padEnd(14)+m[2])})"

install: ## Instala las dependencias
	$(PNPM) install

run: ## Levanta el editor en local con recarga en caliente
	$(PNPM) --filter $(WEB) dev

preview: build ## Construye y sirve el build de producción en local
	$(PNPM) --filter $(WEB) preview

build: ## Construye todos los paquetes
	$(PNPM) build

test: ## Pasa todos los tests
	$(PNPM) test

coverage: ## Pasa los tests con los umbrales de cobertura
	$(PNPM) test:coverage

watch: ## Tests de la web en modo vigilancia
	$(PNPM) --filter $(WEB) test:watch

lint: ## Ejecuta ESLint
	$(PNPM) lint

format: ## Formatea el código con Prettier
	$(PNPM) format

format-check: ## Comprueba el formato sin modificar nada
	$(PNPM) format:check

typecheck: ## Comprueba los tipos en todos los paquetes
	$(PNPM) typecheck

check: ## Lo mismo que el CI: formato, lint, tipos, tests y build
	$(PNPM) check

clean: ## Borra los builds generados
	$(PNPM) -r exec node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
