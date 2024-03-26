FROM ubuntu:latest

ARG USER=user
ENV SUBDOMAIN=""
ENV CONTAINER="default"

RUN apt-get update && apt-get install -y autossh
RUN useradd -m -d /home/$USER -s /bin/bash $USER && \
    mkdir -p /home/$USER/.ssh && \
    chown -R $USER:$USER /home/$USER && \
    ssh-keygen -q -t rsa -N '' -f /home/$USER/.ssh/id_rsa && \
    chmod 700 /home/$USER/.ssh && \
    chmod 600 /home/$USER/.ssh/*

ADD ./bin/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

USER $USER

ENTRYPOINT ["/entrypoint.sh"]
CMD autossh -R "${SUBDOMAIN:+$SUBDOMAIN.serveo.net:}80:$CONTAINER:80" serveo.net
