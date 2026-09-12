export function createEmbedApi(dep) {
    return {
        embedCfgOf: (...a) => embedCfgOf(dep, ...a),
    };
}
// v6 向量政策：embed cfg 单一构造（取自 DistillConfig 可选字段，与 scheduler vec 通道同源；未配置=词法降级）
const embedCfgOf = (dep) => ({
    enabled: !!(dep.config.embedEnabled && dep.config.embedBaseUrl && dep.config.embedModel),
    baseUrl: String(dep.config.embedBaseUrl || ''),
    model: String(dep.config.embedModel || ''),
    apiKeyEnv: String(dep.config.embedApiKeyEnv || ''),
    // v7 召回降权系数（UI 可调：recallColdFactorPercent，% → /100；缺省 35% → 0.35）
    coldFactor: (Number(dep.config.recallColdFactorPercent) > 0 ? Number(dep.config.recallColdFactorPercent) : 35) / 100,
    // v2（ADR-122）：融合策略（缺省 RRF；scheduler 配置 recallFusion=weighted 可回滚）
    fusionKind: dep.config.recallFusion === 'weighted' ? 'weighted' : 'rrf',
    // v2.2（ADR-130）：分层打分与影子打分（缺省 legacy + 影子开）
    scoreMode: dep.config.scoreWeights === 'v2' ? 'v2' : 'legacy',
    shadowScore: dep.config.shadowScore !== false,
});
//# sourceMappingURL=distill-embed.js.map