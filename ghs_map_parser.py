import os
import re
import csv
from collections import defaultdict, OrderedDict


def extract_module_summary(src_path, out_path):
    with open(src_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    start = None
    end = None
    for i, l in enumerate(lines):
        if 'Module Summary' in l:
            start = i
            break

    if start is None:
        raise RuntimeError('Start marker "Module Summary" not found')

    for j in range(start+1, len(lines)):
        if 'Global Symbols' in lines[j] or lines[j].strip().startswith('Global Symbols'):
            end = j
            break

    if end is None:
        # fallback: look for next "Load Map" header after start
        for j in range(start+1, len(lines)):
            if lines[j].startswith('Load Map'):
                end = j
                break

    if end is None:
        raise RuntimeError('End marker "Global Symbols" or next "Load Map" not found')

    slice_lines = lines[start:end]
    with open(out_path, 'w', encoding='utf-8') as out:
        out.writelines(slice_lines)

    return slice_lines


def parse_tobemap_lines(lines, ignore_debug=False):
    # regex: origin+size  section [-> mem]  module
    pattern = re.compile(r'^\s*[0-9A-Fa-f]+\+([0-9A-Fa-f]+)\s+([^\s]+)(?:\s+->\s+\S+)?\s+(.+)$')

    modules = {}
    all_sections = set()

    for l in lines:
        m = pattern.match(l)
        if not m:
            continue
        size_hex = m.group(1)
        section = m.group(2)
        module = m.group(3).strip()
        try:
            size = int(size_hex, 16)
        except Exception:
            continue

        # Optionally ignore debug sections like .debug_info, .debug_line, etc.
        if ignore_debug and section.startswith('.debug'):
            continue

        all_sections.add(section)
        if module not in modules:
            modules[module] = defaultdict(int)
        modules[module][section] += size

    # compute totals
    results = []
    for mod, secs in modules.items():
        total = sum(secs.values())
        results.append((mod, total, dict(secs)))

    # sort by total desc
    results.sort(key=lambda x: x[1], reverse=True)
    return results, sorted(all_sections)


def write_csv(path, results, sections):
    header = ['module', 'total'] + sections
    try:
        with open(path, 'w', newline='', encoding='utf-8') as csvf:
            writer = csv.writer(csvf)
            writer.writerow(header)
            for mod, total, secs in results:
                row = [mod, total]
                for s in sections:
                    row.append(secs.get(s, 0))
                writer.writerow(row)
    except PermissionError:
        # fallback: try alternative filename to avoid crashing when file is locked
        base, ext = os.path.splitext(path)
        alt = base + '_new' + ext
        with open(alt, 'w', newline='', encoding='utf-8') as csvf:
            writer = csv.writer(csvf)
            writer.writerow(header)
            for mod, total, secs in results:
                row = [mod, total]
                for s in sections:
                    row.append(secs.get(s, 0))
                writer.writerow(row)
        print(f"Warning: could not write '{path}', wrote '{alt}' instead")


def write_text(path, results, sections, top_n=None):
    try:
        with open(path, 'w', encoding='utf-8') as f:
            for i, (mod, total, secs) in enumerate(results):
                if top_n and i >= top_n:
                    break
                f.write(f"Module: {mod}\n")
                f.write(f"  Total: {total} bytes\n")
                for s in sections:
                    if s in secs:
                        f.write(f"    {s}: {secs[s]}\n")
                f.write('\n')
    except PermissionError:
        base, ext = os.path.splitext(path)
        alt = base + '_new' + ext
        with open(alt, 'w', encoding='utf-8') as f:
            for i, (mod, total, secs) in enumerate(results):
                if top_n and i >= top_n:
                    break
                f.write(f"Module: {mod}\n")
                f.write(f"  Total: {total} bytes\n")
                for s in sections:
                    if s in secs:
                        f.write(f"    {s}: {secs[s]}\n")
                f.write('\n')
        print(f"Warning: could not write '{path}', wrote '{alt}' instead")


def main():
    base = os.path.dirname(__file__)
    src = os.path.join(base, './examples/CORTEXM_S32G27X.txt')
    tobemap = os.path.join(base, 'tobemap.txt')
    csv_out = os.path.join(base, 'ghs_module_stats.csv')
    txt_out = os.path.join(base, 'ghs_module_stats.txt')

    # Configuration: edit this variable directly to enable/disable filtering of .debug* sections.
    # Set to True to ignore debug sections (e.g. .debug_info, .debug_line).
    DEBUGFILTER = True

    print('Reading', src)
    lines = extract_module_summary(src, tobemap)
    print('Wrote', tobemap)

    results, sections = parse_tobemap_lines(lines, ignore_debug=DEBUGFILTER)
    write_csv(csv_out, results, sections)
    write_text(txt_out, results, sections)

    print('Wrote', csv_out, 'and', txt_out)
    print('Top 20 modules by total size:')
    for i, (mod, total, secs) in enumerate(results[:20]):
        print(f"{i+1:2d}. {mod}: {total} bytes")


if __name__ == '__main__':
    main()
