use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

const QUICK_HASH_SIZE: usize = 4096;

pub fn quick_hash(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; QUICK_HASH_SIZE];
    let bytes_read = reader.read(&mut buffer).ok()?;
    buffer.truncate(bytes_read);

    let mut hasher = Sha256::new();
    hasher.update(&buffer);
    Some(format!("{:x}", hasher.finalize()))
}

pub fn full_hash(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer).ok()?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Some(format!("{:x}", hasher.finalize()))
}

// Simple perceptual hash implementation using average hash algorithm
// Resizes image to 8x8 grayscale, compares each pixel to the mean
pub fn compute_phash(path: &Path) -> Option<Vec<u8>> {
    let img = image::open(path).ok()?;
    let gray = img.resize_exact(8, 8, image::imageops::FilterType::Lanczos3).to_luma8();

    let pixels: Vec<u8> = gray.pixels().map(|p| p.0[0]).collect();
    let mean: f64 = pixels.iter().map(|&p| p as f64).sum::<f64>() / pixels.len() as f64;

    // Build 64-bit hash (8 bytes)
    let mut hash_bytes = vec![0u8; 8];
    for (i, &pixel) in pixels.iter().enumerate() {
        if pixel as f64 > mean {
            hash_bytes[i / 8] |= 1 << (7 - (i % 8));
        }
    }

    Some(hash_bytes)
}

pub fn hamming_distance(hash_a: &[u8], hash_b: &[u8]) -> u32 {
    hash_a
        .iter()
        .zip(hash_b.iter())
        .map(|(a, b)| (a ^ b).count_ones())
        .sum()
}

#[allow(dead_code)]
pub struct HashResult {
    pub path: String,
    pub quick_hash: Option<String>,
    pub full_hash: Option<String>,
    pub phash: Option<Vec<u8>>,
}

#[allow(dead_code)]
pub fn batch_hash(paths: &[String]) -> Vec<HashResult> {
    paths
        .par_iter()
        .map(|p| {
            let path = Path::new(p);
            HashResult {
                path: p.clone(),
                quick_hash: quick_hash(path),
                full_hash: full_hash(path),
                phash: compute_phash(path),
            }
        })
        .collect()
}

pub fn generate_thumbnail(path: &Path, max_size: u32) -> Option<String> {
    let img = image::open(path).ok()?;
    let thumbnail = img.thumbnail(max_size, max_size);

    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    thumbnail
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .ok()?;

    use base64::Engine;
    Some(base64::engine::general_purpose::STANDARD.encode(&buffer))
}
