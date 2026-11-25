#!/bin/sh
: "${MIGRATION_HTPASSWD:?Migration access must be configured}"
umask 077
printf "%s\n" "$MIGRATION_HTPASSWD" > /etc/nginx/migration.htpasswd
# Get K8s DNS resolver from /etc/resolv.conf
NAMESERVER=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')
echo "Using DNS resolver: $NAMESERVER"

# Substitute into nginx config
sed -i "s|__RESOLVER__|$NAMESERVER|g" /etc/nginx/conf.d/default.conf

# Show final config for debugging


exec nginx -g 'daemon off;'
