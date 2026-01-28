// Package vault provides encrypted secret storage using AES-256-GCM.
// Secrets are encrypted at rest and re-encrypted for Edge provisioning.
package vault

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

var (
	ErrSecretNotFound = errors.New("secret not found")
	ErrInvalidKey     = errors.New("invalid encryption key")
)

// Secret represents an encrypted secret
type Secret struct {
	Key          string `json:"key"`
	EncryptedVal string `json:"encrypted_value"` // Base64 encoded
	ProjectID    string `json:"project_id"`
}

// Repository defines the secret storage interface
type Repository interface {
	Get(ctx context.Context, projectID, key string) (*Secret, error)
	Set(ctx context.Context, secret *Secret) error
	Delete(ctx context.Context, projectID, key string) error
	List(ctx context.Context, projectID string) ([]string, error)
}

// Service provides vault operations
type Service struct {
	repo          Repository
	encryptionKey []byte // 32 bytes for AES-256
}

// NewService creates a new vault service
func NewService(repo Repository, encryptionKey string) (*Service, error) {
	key := []byte(encryptionKey)
	if len(key) != 32 {
		return nil, ErrInvalidKey
	}

	return &Service{
		repo:          repo,
		encryptionKey: key,
	}, nil
}

// Set encrypts and stores a secret
func (s *Service) Set(ctx context.Context, projectID, key, value string) error {
	encrypted, err := s.encrypt([]byte(value))
	if err != nil {
		return err
	}

	secret := &Secret{
		Key:          key,
		EncryptedVal: base64.StdEncoding.EncodeToString(encrypted),
		ProjectID:    projectID,
	}

	return s.repo.Set(ctx, secret)
}

// Get retrieves and decrypts a secret
func (s *Service) Get(ctx context.Context, projectID, key string) (string, error) {
	secret, err := s.repo.Get(ctx, projectID, key)
	if err != nil {
		return "", err
	}

	encrypted, err := base64.StdEncoding.DecodeString(secret.EncryptedVal)
	if err != nil {
		return "", err
	}

	decrypted, err := s.decrypt(encrypted)
	if err != nil {
		return "", err
	}

	return string(decrypted), nil
}

// Delete removes a secret
func (s *Service) Delete(ctx context.Context, projectID, key string) error {
	return s.repo.Delete(ctx, projectID, key)
}

// List returns all secret keys for a project (values are not returned)
func (s *Service) List(ctx context.Context, projectID string) ([]string, error) {
	return s.repo.List(ctx, projectID)
}

// ReEncryptForEdge re-encrypts a secret with the project's edge key
func (s *Service) ReEncryptForEdge(ctx context.Context, projectID, key string, edgeKey []byte) ([]byte, error) {
	value, err := s.Get(ctx, projectID, key)
	if err != nil {
		return nil, err
	}

	// Encrypt with edge key
	block, err := aes.NewCipher(edgeKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, []byte(value), nil), nil
}

// encrypt encrypts data using AES-256-GCM
func (s *Service) encrypt(plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// decrypt decrypts data using AES-256-GCM
func (s *Service) decrypt(ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	if len(ciphertext) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}

	nonce := ciphertext[:gcm.NonceSize()]
	ciphertext = ciphertext[gcm.NonceSize():]

	return gcm.Open(nil, nonce, ciphertext, nil)
}
