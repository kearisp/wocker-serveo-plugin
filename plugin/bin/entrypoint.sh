#!/bin/sh

if [ ! "$(ls -A ~/.ssh)" ]; then
    ssh-keygen -q -t rsa -N '' -f ~/.ssh/id_rsa
fi

echo "$@"
exec "$@"
