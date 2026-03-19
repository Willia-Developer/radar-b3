<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readConfig(): array
{
    $configPath = __DIR__ . '/config.php';
    $searchEnabledEnv = getenv('RADAR_SEARCH_ENABLED');

    if (is_file($configPath)) {
        $config = require $configPath;
        if (is_array($config)) {
            return [
                'gemini_api_key' => (string) ($config['gemini_api_key'] ?? ''),
                'gemini_model' => (string) ($config['gemini_model'] ?? 'gemini-2.5-flash'),
                'debug' => !empty($config['debug']),
                'request_timeout' => max(10, (int) ($config['request_timeout'] ?? 40)),
                'connect_timeout' => max(3, (int) ($config['connect_timeout'] ?? 10)),
                'search_enabled' => array_key_exists('search_enabled', $config)
                    ? (bool) $config['search_enabled']
                    : true,
                'fallback_without_search' => array_key_exists('fallback_without_search', $config)
                    ? (bool) $config['fallback_without_search']
                    : true
            ];
        }
    }

    return [
        'gemini_api_key' => getenv('GEMINI_API_KEY') ?: '',
        'gemini_model' => getenv('GEMINI_MODEL') ?: 'gemini-2.5-flash',
        'debug' => filter_var(getenv('RADAR_DEBUG') ?: '0', FILTER_VALIDATE_BOOLEAN),
        'request_timeout' => max(10, (int) (getenv('RADAR_REQUEST_TIMEOUT') ?: 40)),
        'connect_timeout' => max(3, (int) (getenv('RADAR_CONNECT_TIMEOUT') ?: 10)),
        'search_enabled' => $searchEnabledEnv === false
            ? true
            : filter_var($searchEnabledEnv, FILTER_VALIDATE_BOOLEAN),
        'fallback_without_search' => filter_var(getenv('RADAR_FALLBACK_WITHOUT_SEARCH') ?: '1', FILTER_VALIDATE_BOOLEAN)
    ];
}

function isDebugEnabled(array $config): bool
{
    return !empty($config['debug']);
}

function debugLog(array $config, string $message, array $context = []): void
{
    if (!isDebugEnabled($config)) {
        return;
    }

    $entry = [
        'time' => gmdate('c'),
        'message' => $message,
        'context' => $context
    ];

    @file_put_contents(
        __DIR__ . '/radar-debug.log',
        json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND
    );
}

function extractText(array $parts): string
{
    $buffer = '';

    foreach ($parts as $part) {
        if (isset($part['text']) && is_string($part['text'])) {
            $buffer .= $part['text'] . "\n";
        }
    }

    return trim($buffer);
}

function sanitizeModelText(string $text): string
{
    $text = trim($text);
    $text = preg_replace('/```json\s*/i', '', $text) ?? $text;
    $text = preg_replace('/```\s*/', '', $text) ?? $text;

    return trim($text);
}

function extractJson(string $text): ?array
{
    $text = sanitizeModelText($text);

    if ($text === '') {
        return null;
    }

    $candidates = [];
    $depth = 0;
    $start = null;
    $length = strlen($text);

    for ($index = 0; $index < $length; $index++) {
        $char = $text[$index];

        if ($char === '{') {
            if ($depth === 0) {
                $start = $index;
            }
            $depth++;
            continue;
        }

        if ($char === '}') {
            if ($depth > 0) {
                $depth--;
                if ($depth === 0 && $start !== null) {
                    $candidates[] = substr($text, $start, $index - $start + 1);
                    $start = null;
                }
            }
        }
    }

    usort(
        $candidates,
        static fn(string $a, string $b): int => strlen($b) <=> strlen($a)
    );

    foreach ($candidates as $candidate) {
        $decoded = json_decode($candidate, true);
        if (!is_array($decoded)) {
            continue;
        }

        if (!isset($decoded['acoes'], $decoded['fiis'])) {
            continue;
        }

        if (!is_array($decoded['acoes']) || !is_array($decoded['fiis'])) {
            continue;
        }

        return $decoded;
    }

    return null;
}

function extractGroupedJson(string $text, string $groupKey): ?array
{
    $decoded = extractJson($text);
    if (is_array($decoded) && isset($decoded[$groupKey]) && is_array($decoded[$groupKey])) {
        return $decoded;
    }

    $text = sanitizeModelText($text);
    if ($text === '') {
        return null;
    }

    $direct = json_decode($text, true);
    if (is_array($direct)) {
        if (isset($direct[$groupKey]) && is_array($direct[$groupKey])) {
            return $direct;
        }

        $isList = array_keys($direct) === range(0, count($direct) - 1);
        if ($isList) {
            return [$groupKey => $direct];
        }
    }

    return null;
}

function parsePercentValue(string $value): float
{
    $normalized = str_replace(['%', ' '], '', str_replace(',', '.', $value));
    return is_numeric($normalized) ? (float) $normalized : 0.0;
}

function hasMinDy(array $item, float $minDy): bool
{
    return parsePercentValue((string) ($item['dy'] ?? '0')) >= $minDy;
}

function isTrapRiskAccepted(array $item): bool
{
    $risk = strtolower(trim((string) ($item['risco_dividend_trap'] ?? '')));
    return $risk !== 'alto';
}

function hasRequiredKeys(array $item, array $keys): bool
{
    foreach ($keys as $key) {
        if (!array_key_exists($key, $item) || trim((string) $item[$key]) === '') {
            return false;
        }
    }

    return true;
}

function normalizeScore(mixed $value): int
{
    if (is_int($value) || is_float($value) || (is_string($value) && is_numeric(trim($value)))) {
        $score = (int) round((float) $value);
        return max(0, min(100, $score));
    }

    return 0;
}

function normalizeTextValue(mixed $value, string $fallback = '-'): string
{
    $text = trim((string) $value);
    return $text !== '' ? $text : $fallback;
}

function normalizeRadarItem(array $item, string $type): array
{
    $base = [
        'ticker' => normalizeTextValue($item['ticker'] ?? ''),
        'nome' => normalizeTextValue($item['nome'] ?? ''),
        'preco' => normalizeTextValue($item['preco'] ?? '-'),
        'dy' => normalizeTextValue($item['dy'] ?? '0%'),
        'risco_dividend_trap' => normalizeTextValue($item['risco_dividend_trap'] ?? 'Medio'),
        'score' => normalizeScore($item['score'] ?? 0),
        'motivo' => normalizeTextValue($item['motivo'] ?? 'Analise sintetizada pela IA.')
    ];

    if ($type === 'acoes') {
        return $base + [
            'setor' => normalizeTextValue($item['setor'] ?? ''),
            'pl' => normalizeTextValue($item['pl'] ?? '-'),
            'roe' => normalizeTextValue($item['roe'] ?? '-'),
            'margem_liquida' => normalizeTextValue($item['margem_liquida'] ?? '-'),
            'margem_ebitda' => normalizeTextValue($item['margem_ebitda'] ?? '-'),
            'divida_ebitda' => normalizeTextValue($item['divida_ebitda'] ?? '-'),
            'payout' => normalizeTextValue($item['payout'] ?? '-'),
            'historico_dividendos' => normalizeTextValue($item['historico_dividendos'] ?? 'Nao informado pela IA.'),
            'tendencia_receita' => normalizeTextValue($item['tendencia_receita'] ?? 'Nao informado'),
            'tendencia_lucro' => normalizeTextValue($item['tendencia_lucro'] ?? 'Nao informado'),
            'tendencia_dividendos' => normalizeTextValue($item['tendencia_dividendos'] ?? 'Nao informado'),
            'comparacao_setorial' => normalizeTextValue($item['comparacao_setorial'] ?? 'Comparacao setorial nao detalhada.')
        ];
    }

    return $base + [
        'segmento' => normalizeTextValue($item['segmento'] ?? ''),
        'pvp' => normalizeTextValue($item['pvp'] ?? '-'),
        'vacancia' => normalizeTextValue($item['vacancia'] ?? '-'),
        'tipo_contrato' => normalizeTextValue($item['tipo_contrato'] ?? '-'),
        'historico_rendimentos' => normalizeTextValue($item['historico_rendimentos'] ?? 'Nao informado pela IA.'),
        'qualidade_ativos' => normalizeTextValue($item['qualidade_ativos'] ?? 'Nao informado pela IA.'),
        'tendencia_dividendos' => normalizeTextValue($item['tendencia_dividendos'] ?? 'Nao informado'),
        'comparacao_segmento' => normalizeTextValue($item['comparacao_segmento'] ?? 'Comparacao por segmento nao detalhada.')
    ];
}

function normalizeRadarResult(array $result): array
{
    $stocks = [];
    foreach (($result['acoes'] ?? []) as $item) {
        if (is_array($item)) {
            $stocks[] = normalizeRadarItem($item, 'acoes');
        }
    }

    $fiis = [];
    foreach (($result['fiis'] ?? []) as $item) {
        if (is_array($item)) {
            $fiis[] = normalizeRadarItem($item, 'fiis');
        }
    }

    return [
        'acoes' => $stocks,
        'fiis' => $fiis
    ];
}

function filterValidRadarItems(array $items, string $groupKey, float $minDy): array
{
    $filtered = [];

    foreach ($items as $item) {
        if (!hasMinDy($item, $minDy) || !isTrapRiskAccepted($item)) {
            continue;
        }

        $group = trim((string) ($item[$groupKey] ?? ''));
        $ticker = trim((string) ($item['ticker'] ?? ''));
        if ($group === '' || $ticker === '') {
            continue;
        }

        $filtered[] = $item;
    }

    usort(
        $filtered,
        static fn(array $a, array $b): int => normalizeScore($b['score'] ?? 0) <=> normalizeScore($a['score'] ?? 0)
    );

    $selected = [];
    $usedTickers = [];
    $usedGroups = [];

    foreach ($filtered as $item) {
        $ticker = strtoupper(trim((string) $item['ticker']));
        $group = mb_strtolower(trim((string) $item[$groupKey]));

        if (isset($usedTickers[$ticker])) {
            continue;
        }

        if (count($selected) < 2 && isset($usedGroups[$group])) {
            continue;
        }

        $selected[] = $item;
        $usedTickers[$ticker] = true;
        $usedGroups[$group] = true;

        if (count($selected) === 3) {
            return $selected;
        }
    }

    foreach ($filtered as $item) {
        $ticker = strtoupper(trim((string) $item['ticker']));
        if (isset($usedTickers[$ticker])) {
            continue;
        }

        $selected[] = $item;
        $usedTickers[$ticker] = true;

        if (count($selected) === 3) {
            break;
        }
    }

    return $selected;
}

function finalizeRadarResult(array $result, float $minDy): ?array
{
    $normalized = normalizeRadarResult($result);
    $stocks = filterValidRadarItems($normalized['acoes'], 'setor', $minDy);
    $fiis = filterValidRadarItems($normalized['fiis'], 'segmento', $minDy);

    if (count($stocks) < 3 || count($fiis) < 3) {
        return null;
    }

    return [
        'acoes' => $stocks,
        'fiis' => $fiis
    ];
}

function finalizeRadarGroup(array $items, string $groupKey, float $minDy): ?array
{
    $selected = filterValidRadarItems($items, $groupKey, $minDy);
    return count($selected) >= 3 ? array_slice($selected, 0, 3) : null;
}

function validateRadarResult(array $result, float $minDy): bool
{
    if (count($result['acoes']) < 3 || count($result['fiis']) < 3) {
        return false;
    }

    $stockSectors = [];
    $fiiSegments = [];

    foreach ($result['acoes'] as $acao) {
        if (!hasMinDy($acao, $minDy) || !isTrapRiskAccepted($acao)) {
            return false;
        }

        if (!hasRequiredKeys($acao, [
            'ticker',
            'nome',
            'setor',
            'pl',
            'roe',
            'dy',
            'margem_liquida',
            'margem_ebitda',
            'divida_ebitda',
            'payout',
            'historico_dividendos',
            'tendencia_receita',
            'tendencia_lucro',
            'tendencia_dividendos',
            'risco_dividend_trap',
            'comparacao_setorial',
            'score',
            'motivo'
        ])) {
            return false;
        }

        $stockSectors[] = mb_strtolower(trim((string) $acao['setor']));
    }

    foreach ($result['fiis'] as $fii) {
        if (!hasMinDy($fii, $minDy) || !isTrapRiskAccepted($fii)) {
            return false;
        }

        if (!hasRequiredKeys($fii, [
            'ticker',
            'nome',
            'segmento',
            'pvp',
            'dy',
            'vacancia',
            'tipo_contrato',
            'historico_rendimentos',
            'qualidade_ativos',
            'tendencia_dividendos',
            'risco_dividend_trap',
            'comparacao_segmento',
            'score',
            'motivo'
        ])) {
            return false;
        }

        $fiiSegments[] = mb_strtolower(trim((string) $fii['segmento']));
    }

    if (count(array_unique($stockSectors)) < 2) {
        return false;
    }

    if (count(array_unique($fiiSegments)) < 2) {
        return false;
    }

    return true;
}

function isCurlTimeoutError(int $errno): bool
{
    return $errno === CURLE_OPERATION_TIMEDOUT;
}

function isRetryableCurlError(int $errno): bool
{
    return in_array($errno, [
        CURLE_OPERATION_TIMEDOUT,
        CURLE_COULDNT_CONNECT,
        CURLE_COULDNT_RESOLVE_HOST,
        CURLE_GOT_NOTHING,
        CURLE_SEND_ERROR,
        CURLE_RECV_ERROR
    ], true);
}

function geminiRequest(
    array $config,
    string $apiKey,
    string $model,
    string $prompt,
    int $maxOutputTokens,
    bool $searchEnabled
): array
{
    $payload = [
        'contents' => [
            [
                'parts' => [
                    ['text' => $prompt]
                ]
            ]
        ],
        'generationConfig' => [
            'temperature' => 0.1,
            'maxOutputTokens' => $maxOutputTokens
        ]
    ];

    if ($searchEnabled) {
        $payload['tools'] = [
            [
                'google_search' => new stdClass()
            ]
        ];
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' .
        rawurlencode($model) .
        ':generateContent?key=' .
        rawurlencode($apiKey);

    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json'
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => max(10, (int) ($config['request_timeout'] ?? 40)),
        CURLOPT_CONNECTTIMEOUT => max(3, (int) ($config['connect_timeout'] ?? 10))
    ]);

    $raw = curl_exec($ch);

    if ($raw === false) {
        $errno = curl_errno($ch);
        $message = curl_error($ch) ?: 'Erro desconhecido no cURL.';
        curl_close($ch);
        return [
            'ok' => false,
            'retryable' => isRetryableCurlError($errno),
            'timeout' => isCurlTimeoutError($errno),
            'error' => 'Falha ao consultar a API externa: ' . $message,
            'meta' => [
                'curl_errno' => $errno,
                'search_enabled' => $searchEnabled,
                'model' => $model
            ]
        ];
    }

    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $decoded = json_decode((string) $raw, true);

    debugLog($config, 'gemini_response', [
        'http_code' => $httpCode,
        'raw_preview' => mb_substr((string) $raw, 0, 1200)
    ]);

    if ($httpCode >= 400) {
        $message = is_array($decoded) ? ($decoded['error']['message'] ?? 'A API externa retornou erro.') : 'A API externa retornou erro.';
        return [
            'ok' => false,
            'retryable' => false,
            'timeout' => false,
            'error' => $message,
            'meta' => [
                'http_code' => $httpCode,
                'search_enabled' => $searchEnabled,
                'model' => $model
            ]
        ];
    }

    if (!is_array($decoded)) {
        return [
            'ok' => false,
            'retryable' => false,
            'timeout' => false,
            'error' => 'Resposta invalida da API externa.',
            'meta' => [
                'http_code' => $httpCode,
                'search_enabled' => $searchEnabled,
                'model' => $model
            ]
        ];
    }

    return [
        'ok' => true,
        'data' => $decoded,
        'meta' => [
            'http_code' => $httpCode,
            'search_enabled' => $searchEnabled,
            'model' => $model
        ]
    ];
}

function buildPrompt(string $today, string $profile, bool $compactMode, string $groupKey): string
{
    $motivoRule = $compactMode
        ? 'Motivo com no maximo 50 caracteres.'
        : 'Motivo curto e objetivo.';
    $targetLabel = $groupKey === 'acoes' ? 'acoes' : 'FIIs';
    $targetLine = $groupKey === 'acoes'
        ? 'Retorne exatamente 3 acoes da B3 com DY >= 10%.'
        : 'Retorne exatamente 3 FIIs da B3 com DY >= 10%.';
    $diversityLine = $groupKey === 'acoes'
        ? 'Garanta ao menos 2 setores diferentes.'
        : 'Garanta ao menos 2 segmentos diferentes.';
    $format = $groupKey === 'acoes'
        ? '{"acoes":[{"ticker":"XXXX3","nome":"Nome da empresa","setor":"Financeiro","preco":"R$ 00,00","pl":"0.0","roe":"00%","dy":"10%","margem_liquida":"00%","margem_ebitda":"00%","divida_ebitda":"0.0","payout":"00%","historico_dividendos":"Estavel","tendencia_receita":"Alta","tendencia_lucro":"Estavel","tendencia_dividendos":"Alta","risco_dividend_trap":"Baixo","comparacao_setorial":"Melhor que pares","score":85,"motivo":"Justificativa curta"}]}'
        : '{"fiis":[{"ticker":"XXXX11","nome":"Nome do FII","segmento":"Logistico","preco":"R$ 00,00","pvp":"0.00","dy":"10%","vacancia":"0%","tipo_contrato":"Atipico","historico_rendimentos":"Estavel","qualidade_ativos":"Ativos fortes","tendencia_dividendos":"Estavel","risco_dividend_trap":"Baixo","comparacao_segmento":"Melhor que pares","score":85,"motivo":"Justificativa curta"}]}';

    return <<<PROMPT
Analise {$targetLabel} da B3 em {$today} para perfil {$profile}.
Se a busca estiver habilitada, valide com dados online atuais antes de responder.
{$targetLine}
Elimine dividend trap, payout insustentavel, eventos nao recorrentes e deterioracao operacional.
{$diversityLine}
Considere historico e tendencia, nao so a fotografia atual.
Use score de 0 a 100 por classe.
{$motivoRule}
Campos textuais devem ser extremamente curtos, de preferencia 2 a 6 palavras.
Quando um indicador nao se aplicar, use "N/A".
Retorne somente JSON puro, sem markdown e sem texto extra.

Formato exato:
{$format}
PROMPT;
}

function buildRepairPrompt(string $partialText, string $groupKey): string
{
    $sanitized = sanitizeModelText($partialText);
    $targetLabel = $groupKey === 'acoes' ? 'acoes' : 'FIIs';

    return <<<PROMPT
Converta o conteudo abaixo em JSON valido e completo.
O objetivo final e retornar exatamente 3 {$targetLabel}.
Mantenha os tickers ja presentes se existirem.
Complete campos faltantes com textos muito curtos.
Use "N/A" quando um indicador nao se aplicar.
Retorne somente JSON puro, sem markdown e sem comentarios.

Conteudo parcial:
{$sanitized}
PROMPT;
}

function extractSources(array $response): array
{
    $groundingMetadata = $response['candidates'][0]['groundingMetadata'] ?? null;
    if (!is_array($groundingMetadata)) {
        return [];
    }

    $sources = [];
    foreach (($groundingMetadata['groundingChunks'] ?? []) as $chunk) {
        $uri = $chunk['web']['uri'] ?? null;
        $title = $chunk['web']['title'] ?? null;
        if (is_string($uri) && is_string($title)) {
            $sources[] = ['title' => $title, 'url' => $uri];
        }
    }

    return $sources;
}

function fetchRadarGroup(
    array $config,
    string $apiKey,
    string $model,
    string $today,
    string $profile,
    string $groupKey,
    float $minDy,
    float $startedAt
): array {
    $attempt = ['compact' => true, 'max_tokens' => 8192];
    $prompt = buildPrompt($today, $profile, $attempt['compact'], $groupKey);
    $searchPlan = [];

    if (!empty($config['search_enabled'])) {
        $searchPlan[] = true;
    }

    if (empty($config['search_enabled']) || !empty($config['fallback_without_search'])) {
        $searchPlan[] = false;
    }

    $searchPlan = array_values(array_unique($searchPlan, SORT_REGULAR));
    $lastError = null;
    $lastText = '';
    $lastResponse = [];
    $groupLabel = $groupKey === 'acoes' ? 'setor' : 'segmento';

    foreach ($searchPlan as $index => $searchEnabled) {
        $requestResult = geminiRequest($config, $apiKey, $model, $prompt, $attempt['max_tokens'], $searchEnabled);

        if (empty($requestResult['ok'])) {
            $lastError = $requestResult;

            debugLog($config, 'request_failure', [
                'group' => $groupKey,
                'attempt' => $index + 1,
                'search_enabled' => $searchEnabled,
                'retryable' => $requestResult['retryable'] ?? false,
                'timeout' => $requestResult['timeout'] ?? false,
                'error' => $requestResult['error'] ?? 'Erro desconhecido'
            ]);

            $shouldRetryWithoutSearch = $searchEnabled
                && !empty($config['fallback_without_search'])
                && !empty($requestResult['retryable']);

            if ($shouldRetryWithoutSearch) {
                continue;
            }

            return [
                'ok' => false,
                'error' => $requestResult['error'] ?? 'Falha ao consultar a API externa.',
                'meta' => [
                    'group' => $groupKey,
                    'elapsed_ms' => (int) round((microtime(true) - $startedAt) * 1000),
                    'search_enabled' => $searchEnabled,
                    'fallback_without_search' => !empty($config['fallback_without_search']),
                    'upstream' => $requestResult['meta'] ?? []
                ]
            ];
        }

        $response = (array) ($requestResult['data'] ?? []);
        $parts = (array) (($response['candidates'][0]['content']['parts'] ?? []));
        $text = extractText($parts);
        $result = extractGroupedJson($text, $groupKey);

        if (!is_array($result) && trim($text) !== '') {
            $repairPrompt = buildRepairPrompt($text, $groupKey);
            $repairResult = geminiRequest($config, $apiKey, $model, $repairPrompt, 1400, false);

            if (!empty($repairResult['ok'])) {
                $repairResponse = (array) ($repairResult['data'] ?? []);
                $repairParts = (array) (($repairResponse['candidates'][0]['content']['parts'] ?? []));
                $repairText = extractText($repairParts);
                $repaired = extractGroupedJson($repairText, $groupKey);

                debugLog($config, 'repair_attempt', [
                    'group' => $groupKey,
                    'attempt' => $index + 1,
                    'search_enabled' => $searchEnabled,
                    'text_preview' => mb_substr($repairText, 0, 1200)
                ]);

                if (is_array($repaired)) {
                    $result = $repaired;
                    $response = $repairResponse;
                    $text = $repairText;
                }
            }
        }

        debugLog($config, 'parse_attempt', [
            'group' => $groupKey,
            'attempt' => $index + 1,
            'search_enabled' => $searchEnabled,
            'compact' => $attempt['compact'],
            'text_preview' => mb_substr($text, 0, 1200)
        ]);

        if (is_array($result) && isset($result[$groupKey]) && is_array($result[$groupKey])) {
            $normalized = normalizeRadarResult($groupKey === 'acoes'
                ? ['acoes' => $result['acoes'] ?? [], 'fiis' => []]
                : ['acoes' => [], 'fiis' => $result['fiis'] ?? []]
            );
            $items = $normalized[$groupKey];
            $finalItems = finalizeRadarGroup($items, $groupLabel, $minDy);

            if ($finalItems !== null) {
                return [
                    'ok' => true,
                    'items' => $finalItems,
                    'sources' => extractSources($response),
                    'meta' => [
                        'group' => $groupKey,
                        'search_enabled' => $searchEnabled,
                        'fallback_used' => $index > 0
                    ]
                ];
            }
        }

        $lastText = $text;
        $lastResponse = $response;
        $lastError = [
            'error' => 'Nao foi possivel extrair JSON valido da resposta da API ou os resultados nao atenderam as regras de DY, setor e dividend trap.',
            'meta' => [
                'group' => $groupKey,
                'search_enabled' => $searchEnabled,
                'finish_reason' => $response['candidates'][0]['finishReason'] ?? null
            ]
        ];
    }

    return [
        'ok' => false,
        'error' => $lastError['error'] ?? 'Nao foi possivel concluir a analise em tempo real.',
        'raw_preview' => mb_substr(sanitizeModelText($lastText), 0, 1200),
        'finish_reason' => $lastResponse['candidates'][0]['finishReason'] ?? null,
        'meta' => [
            'group' => $groupKey,
            'elapsed_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            'search_enabled' => $lastError['meta']['search_enabled'] ?? null,
            'fallback_without_search' => !empty($config['fallback_without_search'])
        ]
    ];
}

$config = readConfig();
$apiKey = trim((string) ($config['gemini_api_key'] ?? ''));
$model = trim((string) ($config['gemini_model'] ?? 'gemini-2.5-flash'));

if ($apiKey === '' || $apiKey === 'cole_sua_chave_aqui') {
    respond(500, ['error' => 'Configure a chave da API em api/config.php antes de publicar.']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, [
        'ok' => true,
        'message' => 'Backend online. Use POST para buscar os dados.',
        'model' => $model,
        'debug' => isDebugEnabled($config),
        'min_dy' => '10%'
    ]);
}

$requestBody = file_get_contents('php://input');
$request = json_decode($requestBody ?: '{}', true);
if (!is_array($request)) {
    $request = [];
}

$profile = (string) ($request['profile'] ?? 'conservador');
$today = (new DateTimeImmutable('now'))->format('d/m/Y');
$minDy = 10.0;
$startedAt = microtime(true);
$stocksResult = fetchRadarGroup($config, $apiKey, $model, $today, $profile, 'acoes', $minDy, $startedAt);
if (empty($stocksResult['ok'])) {
    respond(502, $stocksResult);
}

$fiisResult = fetchRadarGroup($config, $apiKey, $model, $today, $profile, 'fiis', $minDy, $startedAt);
if (empty($fiisResult['ok'])) {
    respond(502, $fiisResult);
}

$finalResult = [
    'acoes' => $stocksResult['items'],
    'fiis' => $fiisResult['items'],
    'meta' => [
        'model' => $model,
        'elapsed_ms' => (int) round((microtime(true) - $startedAt) * 1000),
        'groups' => [
            $stocksResult['meta'],
            $fiisResult['meta']
        ]
    ]
];

$sources = array_merge($stocksResult['sources'] ?? [], $fiisResult['sources'] ?? []);
if ($sources !== []) {
    $uniqueSources = [];
    $seen = [];
    foreach ($sources as $source) {
        $key = ($source['title'] ?? '') . '|' . ($source['url'] ?? '');
        if ($key === '|' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $uniqueSources[] = $source;
    }
    if ($uniqueSources !== []) {
        $finalResult['sources'] = $uniqueSources;
    }
}

respond(200, $finalResult);
