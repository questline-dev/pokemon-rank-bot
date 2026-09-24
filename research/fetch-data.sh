#!/bin/sh
# 봇이 쓰는 외부 데이터 5개를 research/data/ 에 받는다. (커밋하지 않음 - .gitignore)
# 받은 시각과 sha256을 research/data/FETCHED.txt 에 남긴다.
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)/data"
mkdir -p "$DIR"
cd "$DIR"
{
  date -u '+UTC %Y-%m-%d %H:%M:%S'
  for u in \
    https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv \
    https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species.csv \
    https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv \
    https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_forms.csv \
    https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json
  do
    f=$(basename "$u")
    code=$(curl -sS -L -o "$f" -w '%{http_code}' "$u")
    if [ "$code" != "200" ]; then echo "받기 실패 (HTTP $code): $u" >&2; exit 1; fi
    echo "$code $(wc -c < "$f") bytes $f"
  done
  sha256sum pokemon_species_names.csv pokemon_species.csv pokemon.csv pokemon_forms.csv gamemaster.json
} | tee FETCHED.txt
