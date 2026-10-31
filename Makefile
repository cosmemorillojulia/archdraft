.DEFAULT_GOAL := help

WEB := @archdraft/web

.PHONY: help install run preview build test coverage watch lint format format-check typecheck check clean

help: ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

install: ## Instala las dependencias
	pnpm install

run: ## Levanta el editor en local con recarga en caliente
	pnpm --filter $(WEB) dev

preview: build ## Construye y sirve el build de producción en local
	pnpm --filter $(WEB) preview

build: ## Construye todos los paquetes
	pnpm build

test: ## Pasa todos los tests
	pnpm test

coverage: ## Pasa los tests con los umbrales de cobertura
	pnpm test:coverage

watch: ## Tests de la web en modo vigilancia
	pnpm --filter $(WEB) test:watch

lint: ## Ejecuta ESLint
	pnpm lint

format: ## Formatea el código con Prettier
	pnpm format

format-check: ## Comprueba el formato sin modificar nada
	pnpm format:check

typecheck: ## Comprueba los tipos en todos los paquetes
	pnpm typecheck

check: ## Lo mismo que el CI: formato, lint, tipos, tests y build
	pnpm check

clean: ## Borra los builds generados
	pnpm -r exec node -e "require('fs').rmSync('dist',{recursive:true,force:true})"
