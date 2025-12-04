# Linker Map Parsers

This repository contains two small Python tools to parse linker map files and produce per-module size statistics:

- `map_parser.py` — parses Green Hills (GHS) compiler map format (your `CORTEXM_S32G27X.map`).
- `gcc_map_parser.py` — parses GCC/arm-none-eabi map format (your `gcc_linkermap.map`).

Both tools extract section-level sizes for each module/object and produce CSV and human-readable TXT summaries sorted by total size.

## Files

- `map_parser.py` — GHS map parser. It finds the `Module Summary` section in the GHS map and aggregates sizes by module and section.
- `gcc_map_parser.py` — GCC map parser. It scans the GCC map for section lines and aggregates sizes by module and section.
- `tobemap.txt` — intermediate extraction created by `map_parser.py` (GHS parser).
- `module_stats.csv` / `module_stats.txt` — outputs from `map_parser.py` (GHS); may be suffixed `_no_debug` or `_new` depending on options/file locks.
- `gcc_module_stats.csv` / `gcc_module_stats.txt` — outputs from `gcc_map_parser.py` (GCC); may be suffixed `_new` if the original files are locked.

## Quick usage (PowerShell on Windows)

Open PowerShell and run in the repository folder:

```powershell
cd D:\11_web\linker-map-statistics
python .\map_parser.py
python .\gcc_map_parser.py
```

You should see printed top-N modules by total size, and the CSV/TXT output files will be written to the same folder.

## Toggle debug filtering

Both scripts support ignoring debug sections (sections starting with `.debug`) by toggling an in-script boolean variable:

- `map_parser.py` — edit the `DEBUGFILTER` variable (in `main()`) and set it to `True` to ignore `.debug*` sections.
- `gcc_map_parser.py` — edit the `DEBUGFILTER` variable (in `main()`) and set it to `True` to ignore `.debug*` sections.

This makes it easy to exclude DWARF/debug data from size totals when you only care about ROM/RAM runtime usage.

## Output format

- CSV: first column `module`, second column `total` (bytes), then one column per section (e.g. `.text`, `.data`, `.bss`, `.rodata`, `.debug_info`, ...). Each row contains the byte count for that module and section (0 if absent).
- TXT: human-readable listing per module with totals and per-section breakdown.

If a target output file is locked or cannot be overwritten, the scripts will write alternative files with the `_new` suffix and print a warning message.

## Example: check one module

Find details for a single module in the CSV or TXT. Example PowerShell commands:

```powershell
# Find in TXT
Select-String -Path .\module_stats.txt -Pattern 'App_Add.o'

# Find in CSV and show the row
Import-Csv .\module_stats.csv | Where-Object { $_.module -like '*App_Add.o*' }
```

## Next improvements (ideas you can request)

- Add ROM vs RAM classification (map sections to ROM or RAM and add columns `rom_bytes` / `ram_bytes`).
- Add human-readable columns (KB / MB) to CSV.
- Add a simple CLI or small config file to toggle options instead of editing the script.
- Normalize module names (strip long paths or collapse archive(member) entries to more compact labels).

If you want any of these, tell me which one and I will implement it.

## Notes

- These scripts are intentionally minimal and designed for local ad-hoc analysis. They don't attempt to replicate every edge case of linker map formats, but they work with the examples you provided.
- If your map files vary in layout, share additional map snippets and I will harden the regexes and parsing logic.

---
Created to help analyze per-module ROM/RAM usage from GHS and GCC linker map outputs.
