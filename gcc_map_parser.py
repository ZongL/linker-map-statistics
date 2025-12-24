import os
import re
import csv
from collections import defaultdict


def parse_gcc_map_lines(lines, ignore_debug=False):
    # Matches lines like:
    #  .text          0x340001e0        0x30 c:/.../libgcc.a(_aeabi_uldivmod.o)
    # section  origin(hex)    size(hex)    module
    pattern = re.compile(r'^\s*([.\w*+-]+)\s+0x[0-9A-Fa-f]+\s+0x([0-9A-Fa-f]+)\s+(.+)$')

    modules = {}
    all_sections = set()

    for l in lines:
        m = pattern.match(l)
        if not m:
            continue
        section = m.group(1).strip()
        size_hex = m.group(2)
        module_raw = m.group(3).strip()

        # optionally ignore debug sections
        if ignore_debug and section.startswith('.debug'):
            continue

        try:
            size = int(size_hex, 16)
        except Exception:
            continue

        # normalize module name: take basename for paths, keep archive(member) intact
        mod = module_raw
        # if it's a path, extract basename
        # handle windows backslashes
        if os.path.sep in module_raw or '/' in module_raw:
            # if archive with member, keep whole
            if '(' in module_raw and ')' in module_raw:
                mod = module_raw
            else:
                mod = os.path.basename(module_raw)

        all_sections.add(section)
        if mod not in modules:
            modules[mod] = defaultdict(int)
        modules[mod][section] += size

    results = []
    for mod, secs in modules.items():
        total = sum(secs.values())
        results.append((mod, total, dict(secs)))

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


def extract_relevant_lines(src_path):
    # For GCC maps, we can parse entire file and match section lines
    with open(src_path, 'r', encoding='utf-8', errors='replace') as f:
        return f.readlines()


def main():
    base = os.path.dirname(__file__)
    src = os.path.join(base, './examples/gcc_linkermap.map')
    csv_out = os.path.join(base, 'gcc_module_stats.csv')
    txt_out = os.path.join(base, 'gcc_module_stats.txt')

    # Configuration: set to True to ignore .debug* sections
    DEBUGFILTER = False

    print('Reading', src)
    lines = extract_relevant_lines(src)

    results, sections = parse_gcc_map_lines(lines, ignore_debug=DEBUGFILTER)
    write_csv(csv_out, results, sections)
    write_text(txt_out, results, sections)

    print('Wrote', csv_out, 'and', txt_out)
    print('Top 20 modules by total size:')
    for i, (mod, total, secs) in enumerate(results[:20]):
        print(f"{i+1:2d}. {mod}: {total} bytes")


if __name__ == '__main__':
    main()
