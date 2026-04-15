#!/bin/bash

# JobDex Validation Guardrail Script
# Run this before every commit to ensure architectural integrity.

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get the directory where the script is located
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

echo -e "${BLUE}Starting JobDex Validation Pipeline...${NC}\n"
echo -e "${BLUE}Project Root: $PROJECT_ROOT${NC}\n"

# 1. Frontend Validation (TypeScript)
echo -e "${BLUE}[1/3] Checking TypeScript types...${NC}"
bun run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ TypeScript types are valid.${NC}\n"
else
    echo -e "${RED}✗ TypeScript type check failed. Fix errors before committing.${NC}"
    exit 1
fi

# 2. Backend Validation (Rust Clippy)
echo -e "${BLUE}[2/3] Running Rust Clippy (Lints)...${NC}"
cd src-tauri && cargo clippy -- -D warnings
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Rust lints passed (0 warnings).${NC}\n"
else
    echo -e "${RED}✗ Rust lints failed.${NC}"
    exit 1
fi
cd ..

# 3. Backend Validation (Rust Format)
echo -e "${BLUE}[3/3] Checking Rust formatting...${NC}"
cd src-tauri && cargo fmt -- --check
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Rust formatting is correct.${NC}\n"
else
    echo -e "${RED}✗ Rust formatting check failed. Run 'cargo fmt' to fix.${NC}"
    exit 1
fi
cd ..

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   VALIDATION PASSED: Code is clean.    ${NC}"
echo -e "${GREEN}========================================${NC}"
