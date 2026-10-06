"""上游 wrong-notebook 模型字段 vs 本项目的机械比对（只读；用于自证移植忠实度）。"""
import re

UP = r"C:\Users\48489\Desktop\huahuastudy\research\_artifacts\ref_repos\wrong-notebook\wrong-notebook-main\prisma\schema.prisma"
OURS = r"C:\Users\48489\Desktop\time\apps\api\prisma\schema.prisma"


def models(text):
    out = {}
    for m in re.finditer(r"model\s+(\w+)\s*\{(.*?)\n\}", text, re.S):
        name, body = m.group(1), m.group(2)
        fields = []
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("@@"):
                continue
            parts = line.split()
            if len(parts) >= 2 and not parts[0].startswith("@"):
                fields.append(parts[0])
        out[name] = fields
    return out


def main():
    up = models(open(UP, encoding="utf-8").read())
    ours = models(open(OURS, encoding="utf-8").read())
    pairs = [
        ("User", "User"),
        ("KnowledgeTag", "KnowledgeTag"),
        ("Subject", "(未采用：固定学科枚举)"),
        ("ErrorItem", "WrongQuestion"),
        ("ReviewSchedule", "WrongQuestionReview"),
        ("PracticeRecord", "PracticeRecord"),
    ]
    for u, o in pairs:
        uf = up.get(u, [])
        of = ours.get(o, [])
        lower_o = [x.lower() for x in of]
        missing = [f for f in uf if f.lower() not in lower_o]
        extra = [f for f in of if f.lower() not in [x.lower() for x in uf]]
        print(f"{u} -> {o}")
        print(f"   upstream fields: {len(uf)} | ours: {len(of)}")
        print(f"   NOT same-named ours: {missing if missing else '(none)'}")
        print(f"   ours-added: {extra if extra else '(none)'}")
        print()


if __name__ == "__main__":
    main()
