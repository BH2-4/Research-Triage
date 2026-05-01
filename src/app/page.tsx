import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero-layout">
      <div className="panel hero-card">
        <span className="eyebrow">科研课题分诊台</span>
        <h1>拿到课题后，不知道该先问什么？</h1>
        <p className="hero-copy">
          先别急着选模型、查论文或堆资料。系统会先判断你是谁、你卡在哪、你最适合走哪条路径，再给出第一步和推荐服务入口。
        </p>

        <div className="pill-row">
          <span className="pill">中文学生用户</span>
          <span className="pill">文本优先</span>
          <span className="pill">先分诊再回答</span>
        </div>

        <div className="actions">
          <Link className="button button-primary" href="/intake">
            立即诊断课题
          </Link>
          <Link className="button button-secondary" href="/intake">
            我不知道怎么描述，让 AI 引导我
          </Link>
        </div>
      </div>

      <div className="hero-side">
        <article className="panel insight-card">
          <span className="eyebrow">你会看到什么</span>
          <ul className="bullet-list">
            <li>用户类型、当前阶段和主要卡点</li>
            <li>课题人话解释和难度等级</li>
            <li>3 条失败风险和 3-4 步最低可行路径</li>
            <li>只推荐一个最合适的服务层级</li>
          </ul>
        </article>

        <article className="panel insight-card">
          <span className="eyebrow">边界</span>
          <p>
            这不是代写工具，也不帮助伪造实验或数据。它只做理解课题、压缩目标、规划真实交付和整理汇报口径。
          </p>
        </article>
      </div>
    </section>
  );
}
