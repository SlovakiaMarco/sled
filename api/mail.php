<?php
/**
 * sLED – odoslanie formulárov (Collab + cenová kalkulačka) na e-mail.
 * Kompatibilné s PHP 7.4+.
 *
 * Nastavenie:
 *  - MAIL_TO   adresa, kam chodia dopyty
 *  - MAIL_FROM existujúca adresa na doméne webu (kvôli SPF/doručiteľnosti), napr. no-reply@sled.sk
 *
 * Cena z kalkulačky sa vždy prepočíta na serveri z data/pricing.json,
 * hodnota poslaná z prehliadača sa ignoruje.
 */

declare(strict_types=1);

const MAIL_TO = 'sled@ascensio.sk';
const MAIL_FROM = 'no-reply@sled.sk';
const MAIL_FROM_NAME = 'sLED web';
const MIN_FILL_MS = 3000;
const RATE_LIMIT_SECONDS = 20;
const PRICING_FILE = __DIR__ . '/../data/pricing.json';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function clean($value, int $max = 200, bool $multiline = false): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $v = trim(strip_tags((string) $value));
    if (!$multiline) {
        $v = preg_replace('/[\r\n\t]+/u', ' ', $v) ?? '';
    }
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max, 'UTF-8');
}

function encode_header(string $text): string
{
    return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Metóda nie je povolená.']);
}

// Rovnaký pôvod (ochrana pred odosielaním z cudzích webov)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '' && $host !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) {
    respond(403, ['ok' => false, 'error' => 'Nepovolený pôvod požiadavky.']);
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    respond(400, ['ok' => false, 'error' => 'Neplatné dáta.']);
}

// Anti-spam: honeypot + minimálny čas vyplnenia → potichu „úspech“
if (!empty($data['website']) || (int) ($data['t'] ?? 0) < MIN_FILL_MS) {
    respond(200, ['ok' => true]);
}

// Jednoduchý rate limit podľa IP
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rlFile = sys_get_temp_dir() . '/sled_rl_' . md5($ip);
if (is_file($rlFile) && (time() - (int) @filemtime($rlFile)) < RATE_LIMIT_SECONDS) {
    respond(429, ['ok' => false, 'error' => 'Príliš veľa požiadaviek. Skúste to o chvíľu znova.']);
}

$form = ($data['form'] ?? '') === 'kalkulacka' ? 'kalkulacka' : 'collab';
$name = clean($data['name'] ?? '', 100);
$company = clean($data['company'] ?? '', 150);
$phone = clean($data['phone'] ?? '', 40);
$email = clean($data['email'] ?? '', 150);
$message = clean($data['message'] ?? '', 4000, true);
$coopType = clean($data['coopType'] ?? '', 200);
$start = clean($data['start'] ?? '', 20);
$consent = ($data['consent'] ?? false) === true;

$errors = [];
if (mb_strlen($name, 'UTF-8') < 2) {
    $errors['name'] = 'Meno je povinné.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Neplatný e-mail.';
}
if (!preg_match('/^\+?[0-9][0-9\s\-()\/]{7,18}[0-9]$/', $phone)) {
    $errors['phone'] = 'Neplatné telefónne číslo.';
}
if ($form === 'collab' && mb_strlen($message, 'UTF-8') < 2) {
    $errors['message'] = 'Správa je povinná.';
}
if (!$consent) {
    $errors['consent'] = 'Chýba súhlas so spracovaním osobných údajov.';
}

$lines = [];
$subject = '';

if ($form === 'kalkulacka') {
    $pricing = json_decode((string) @file_get_contents(PRICING_FILE), true);
    if (!is_array($pricing)) {
        respond(500, ['ok' => false, 'error' => 'Cenník nie je dostupný.']);
    }
    $durId = clean($data['duration'] ?? '', 10);
    $spotId = clean($data['spot'] ?? '', 10);
    $double = ($data['double'] ?? false) === true;

    $durLabel = null;
    foreach ($pricing['durations'] as $d) {
        if ($d['id'] === $durId) {
            $durLabel = $d['label'];
        }
    }
    $spotLabel = null;
    foreach ($pricing['spots'] as $s) {
        if ($s['id'] === $spotId) {
            $spotLabel = $s['label'];
        }
    }
    if ($durLabel === null || $spotLabel === null || !isset($pricing['prices'][$durId][$spotId]['cents'])) {
        $errors['calc'] = 'Neplatná konfigurácia kalkulačky.';
    } else {
        $cents = (int) $pricing['prices'][$durId][$spotId]['cents'] * ($double ? (int) ($pricing['doubleMultiplier'] ?? 2) : 1);
        $priceText = number_format($cents / 100, 2, ',', ' ') . ' €';
        $subject = 'sLED – dopyt z kalkulačky (' . $durLabel . ' · ' . $spotLabel . ($double ? ' · 2×' : '') . ')';
        $lines[] = 'NOVÝ DOPYT Z CENOVEJ KALKULAČKY';
        $lines[] = str_repeat('-', 40);
        $lines[] = 'Dĺžka prenájmu:   ' . $durLabel;
        $lines[] = 'Dĺžka spotu:      ' . $spotLabel;
        $lines[] = 'Spot 2× v playliste: ' . ($double ? 'Áno' : 'Nie');
        $lines[] = 'Cena (bez DPH):   ' . $priceText;
        $lines[] = '';
    }
} else {
    $subject = 'sLED – Collab dopyt (' . $name . ')';
    $lines[] = 'NOVÝ DOPYT – COLLAB';
    $lines[] = str_repeat('-', 40);
    $lines[] = 'Typ spolupráce:       ' . ($coopType !== '' ? $coopType : '–');
    $lines[] = 'Preferovaný začiatok: ' . ($start !== '' ? $start : '–');
    $lines[] = '';
}

if ($errors) {
    respond(422, ['ok' => false, 'error' => 'Skontrolujte prosím vyplnené údaje.', 'fields' => $errors]);
}

$lines[] = 'KONTAKT';
$lines[] = str_repeat('-', 40);
$lines[] = 'Meno:     ' . $name;
$lines[] = 'Firma:    ' . ($company !== '' ? $company : '–');
$lines[] = 'Telefón:  ' . $phone;
$lines[] = 'E-mail:   ' . $email;
$lines[] = '';
$lines[] = 'POZNÁMKA';
$lines[] = str_repeat('-', 40);
$lines[] = $message !== '' ? $message : '–';
$lines[] = '';
$lines[] = '—';
$lines[] = 'Odoslané z webu sled.sk ' . date('d.m.Y H:i') . ' · IP ' . $ip;
$lines[] = 'Odosielateľ súhlasil so spracovaním osobných údajov.';

$body = implode("\r\n", $lines);

$headers = [
    'From: ' . encode_header(MAIL_FROM_NAME) . ' <' . MAIL_FROM . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: sLED web',
];

$sent = @mail(MAIL_TO, encode_header($subject), $body, implode("\r\n", $headers), '-f' . MAIL_FROM);
if (!$sent) {
    // niektoré hostingy nepovoľujú parameter -f
    $sent = @mail(MAIL_TO, encode_header($subject), $body, implode("\r\n", $headers));
}

if (!$sent) {
    respond(500, ['ok' => false, 'error' => 'E-mail sa nepodarilo odoslať.']);
}

@touch($rlFile);
respond(200, ['ok' => true]);
