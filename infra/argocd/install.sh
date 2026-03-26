#!/bin/bash
# Argo CD Installation Script for k3s/Kubernetes
set -e

echo "=== Installing Argo CD ==="

# Create argocd namespace
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# Install Argo CD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "Waiting for Argo CD to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# Get initial admin password
echo ""
echo "=== Argo CD Initial Admin Password ==="
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo ""
echo ""

# Port-forward to access Argo CD UI
echo "=== Access Argo CD UI ==="
echo "Run: kubectl port-forward svc/argocd-server -n argocd 8443:443"
echo "Then open: https://localhost:8443"
echo "Username: admin"
echo ""

# Apply application manifests
echo "=== Deploying Applications ==="
kubectl apply -f application.yaml

echo "=== Done! ==="
